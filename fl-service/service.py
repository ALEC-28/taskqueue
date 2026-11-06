import os, threading, time
from pathlib import Path
import httpx, torch
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, transforms
from partition import dirichlet_partition
from fl_core import MLP, local_train, fedavg, evaluate

STORE = Path(os.getenv("FL_STORE", "./fl_store"))
NODE_URL = os.getenv("NODE_URL", "http://localhost:3000")
app = FastAPI(title="fl-service")
_lock = threading.Lock()
_done: dict = {}       # step_id -> callback body (idempotency)
_running: set = set()
_data: dict = {}

# ---------- data ----------
def _mnist():
    with _lock:
        if "tr" not in _data:
            tf = transforms.Compose([transforms.ToTensor(), transforms.Normalize((0.1307,), (0.3081,))])
            _data["tr"] = datasets.MNIST("./data", train=True, download=True, transform=tf)
            _data["te"] = datasets.MNIST("./data", train=False, download=True, transform=tf)
        return _data["tr"], _data["te"]

def _parts(seed, n, alpha):
    key = ("p", seed, n, alpha)
    tr, _ = _mnist()
    with _lock:
        if key not in _data:
            _data[key] = dirichlet_partition(tr.targets.numpy(), n, alpha, seed)
        return _data[key]

# ---------- storage ----------
def _save(obj, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    torch.save(obj, tmp)
    os.replace(tmp, path)

def _load(path: Path):
    return torch.load(path, map_location="cpu", weights_only=True)

def gpath(run_id, v): return STORE / run_id / f"global_v{v}.pt"
def upath(run_id, r, cid): return STORE / run_id / f"r{r}" / f"{cid}.pt"

# ---------- callback + idempotent runner ----------
def callback(body):
    for attempt in range(3):
        try:
            httpx.post(f"{NODE_URL}/internal/step-complete", json=body, timeout=10).raise_for_status()
            return
        except Exception as e:
            print(f"[fl] callback attempt {attempt+1} failed: {e}")
            time.sleep(1 + attempt)

def run_step(step_id, fn, *args):
    with _lock:
        if step_id in _done:
            body = _done[step_id]
        elif step_id in _running:
            return
        else:
            _running.add(step_id)
            body = None
    if body is None:
        try:
            body = {"step_id": step_id, "status": "done", "error": None, "result": fn(*args)}
            with _lock: _done[step_id] = body
        except Exception as e:
            body = {"step_id": step_id, "status": "failed", "error": str(e), "result": None}
        finally:
            with _lock: _running.discard(step_id)
    callback(body)

# ---------- models ----------
class InitReq(BaseModel):
    run_id: str
    seed: int = 42

class TrainReq(BaseModel):
    step_id: str; run_id: str; client_id: str; round: int; model_version: int
    algorithm: str = "fedavg"; mu: float = 0.01
    local_epochs: int = 1; lr: float = 0.01; batch_size: int = 32
    seed: int = 42; dataset: str = "mnist"
    num_clients: int = 20; alpha: float = 0.5; partition_index: int

class UpdateRef(BaseModel):
    client_id: str; num_samples: int

class AggReq(BaseModel):
    step_id: str; run_id: str; round: int; model_version: int
    algorithm: str = "fedavg"; updates: list[UpdateRef]

class EvalReq(BaseModel):
    step_id: str; run_id: str; round: int; model_version: int; dataset: str = "mnist"

# ---------- step bodies ----------
def do_train(r: TrainReq):
    t0 = time.time()
    tr, _ = _mnist()
    shard = _parts(r.seed, r.num_clients, r.alpha)[r.partition_index]
    dl = DataLoader(Subset(tr, shard.tolist()), batch_size=r.batch_size, shuffle=True)
    mu = r.mu if r.algorithm == "fedprox" else 0.0
    torch.manual_seed(r.seed + r.round * 1000 + r.partition_index)
    state, _, loss = local_train(_load(gpath(r.run_id, r.model_version)), dl, r.local_epochs, r.lr, mu)
    _save(state, upath(r.run_id, r.round, r.client_id))
    return {"client_id": r.client_id, "round": r.round, "num_samples": len(shard),
            "train_loss": loss, "duration_ms": int((time.time() - t0) * 1000)}

def do_aggregate(r: AggReq):
    ups = [(_load(upath(r.run_id, r.round, u.client_id)), u.num_samples) for u in r.updates]
    if not ups: raise ValueError("no updates to aggregate")
    nv = r.model_version + 1
    _save(fedavg(ups), gpath(r.run_id, nv))
    return {"round": r.round, "new_model_version": nv, "n_clients": len(ups)}

def do_eval(r: EvalReq):
    _, te = _mnist()
    acc, loss = evaluate(_load(gpath(r.run_id, r.model_version)), DataLoader(te, batch_size=512))
    return {"round": r.round, "model_version": r.model_version, "accuracy": acc, "loss": loss}

# ---------- endpoints ----------
@app.get("/health")
def health(): return {"ok": True}

@app.post("/fl/init")
def init(r: InitReq):
    torch.manual_seed(r.seed)
    p = gpath(r.run_id, 0)
    if not p.exists(): _save(MLP().state_dict(), p)
    return {"model_version": 0}

@app.post("/fl/train", status_code=202)
def train(r: TrainReq, bg: BackgroundTasks):
    bg.add_task(run_step, r.step_id, do_train, r); return {"accepted": True}

@app.post("/fl/aggregate", status_code=202)
def aggregate(r: AggReq, bg: BackgroundTasks):
    bg.add_task(run_step, r.step_id, do_aggregate, r); return {"accepted": True}

@app.post("/fl/evaluate", status_code=202)
def evaluate_ep(r: EvalReq, bg: BackgroundTasks):
    bg.add_task(run_step, r.step_id, do_eval, r); return {"accepted": True}
