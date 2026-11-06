"""Run: python test_service.py  (no Node needed; callback is captured)."""
import os, shutil, tempfile
os.environ["FL_STORE"] = tempfile.mkdtemp()
from fastapi.testclient import TestClient
import service

got = []
service.callback = lambda b: got.append(b)
c = TestClient(service.app)
RUN = "t1"

assert c.post("/fl/init", json={"run_id": RUN}).json()["model_version"] == 0
base = dict(run_id=RUN, round=1, model_version=0, num_clients=10, alpha=0.5, seed=42, local_epochs=1)
for i in (0, 1, 2):
    assert c.post("/fl/train", json={**base, "step_id": f"s-train-{i}", "client_id": f"c{i}", "partition_index": i, "algorithm": "fedprox"}).status_code == 202
trains = [b for b in got if b["step_id"].startswith("s-train")]
assert len(trains) == 3 and all(b["status"] == "done" for b in trains), got

c.post("/fl/aggregate", json={"step_id": "s-agg", "run_id": RUN, "round": 1, "model_version": 0,
                              "updates": [{"client_id": b["result"]["client_id"], "num_samples": b["result"]["num_samples"]} for b in trains]})
agg = got[-1]; assert agg["status"] == "done" and agg["result"]["new_model_version"] == 1, agg

c.post("/fl/evaluate", json={"step_id": "s-eval", "run_id": RUN, "round": 1, "model_version": 1})
ev = got[-1]; assert ev["status"] == "done" and ev["result"]["accuracy"] > 0.3, ev
print("eval:", ev["result"])

n = len(got)
c.post("/fl/train", json={**base, "step_id": "s-train-0", "client_id": "c0", "partition_index": 0})
assert len(got) == n + 1 and got[-1] == trains[0], "idempotent replay failed"

c.post("/fl/train", json={**base, "step_id": "s-bad", "client_id": "cx", "partition_index": 0, "model_version": 99})
assert got[-1]["status"] == "failed"
print("ALL OK")
