import torch, torch.nn as nn, torch.nn.functional as F

class MLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(784, 200)
        self.fc2 = nn.Linear(200, 10)
    def forward(self, x):
        return self.fc2(F.relu(self.fc1(x.view(x.size(0), -1))))

def local_train(global_state, loader, epochs, lr, mu=0.0, device="cpu"):
    """mu=0 -> FedAvg local step; mu>0 -> FedProx."""
    model = MLP().to(device)
    model.load_state_dict(global_state)
    g = [p.detach().clone() for p in model.parameters()]
    opt = torch.optim.SGD(model.parameters(), lr=lr)
    model.train()
    tot, n = 0.0, 0
    for _ in range(epochs):
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            loss = F.cross_entropy(model(x), y)
            if mu > 0:
                loss = loss + (mu / 2) * sum(((p - q) ** 2).sum() for p, q in zip(model.parameters(), g))
            loss.backward()
            opt.step()
            tot += loss.item() * len(y); n += len(y)
    return {k: v.cpu() for k, v in model.state_dict().items()}, n // max(epochs, 1), tot / max(n, 1)

def fedavg(updates):
    """updates: list of (state_dict, num_samples). Weighted by num_samples."""
    total = sum(n for _, n in updates)
    out = {}
    for k in updates[0][0]:
        if updates[0][0][k].is_floating_point():
            out[k] = sum(s[k] * (n / total) for s, n in updates)
        else:
            out[k] = updates[0][0][k]
    return out

@torch.no_grad()
def evaluate(state, loader, device="cpu"):
    model = MLP().to(device); model.load_state_dict(state); model.eval()
    correct, loss, n = 0, 0.0, 0
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        o = model(x)
        loss += F.cross_entropy(o, y, reduction="sum").item()
        correct += (o.argmax(1) == y).sum().item(); n += len(y)
    return correct / n, loss / n
