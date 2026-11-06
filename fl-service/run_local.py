"""Sanity check, no HTTP: random selection, FedAvg vs FedProx on non-IID MNIST."""
import sys, random, torch
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, transforms
from partition import dirichlet_partition
from fl_core import MLP, local_train, fedavg, evaluate

alg = sys.argv[1] if len(sys.argv) > 1 else "fedavg"
mu = 0.01 if alg == "fedprox" else 0.0
SEED, N, K, ROUNDS, ALPHA = 42, 20, 5, 10, 0.5
random.seed(SEED); torch.manual_seed(SEED)

tf = transforms.Compose([transforms.ToTensor(), transforms.Normalize((0.1307,), (0.3081,))])
tr = datasets.MNIST("./data", train=True, download=True, transform=tf)
te = datasets.MNIST("./data", train=False, download=True, transform=tf)
parts = dirichlet_partition(tr.targets.numpy(), N, ALPHA, SEED)
test_dl = DataLoader(te, batch_size=512)

state = MLP().state_dict()
for r in range(1, ROUNDS + 1):
    sel = random.sample(range(N), K)
    ups = []
    for c in sel:
        dl = DataLoader(Subset(tr, parts[c].tolist()), batch_size=32, shuffle=True)
        s, n, _ = local_train(state, dl, epochs=1, lr=0.01, mu=mu)
        ups.append((s, len(parts[c])))
    state = fedavg(ups)
    acc, loss = evaluate(state, test_dl)
    print(f"{alg} round {r:02d} acc={acc:.4f} loss={loss:.4f}")
