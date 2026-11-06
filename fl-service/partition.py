import numpy as np

def dirichlet_partition(labels, num_clients, alpha, seed=0, min_size=10, max_tries=100):
    labels = np.asarray(labels)
    rng = np.random.default_rng(seed)
    classes = np.unique(labels)
    for _ in range(max_tries):
        idx = [[] for _ in range(num_clients)]
        for c in classes:
            ids = np.where(labels == c)[0]
            rng.shuffle(ids)
            p = rng.dirichlet([alpha] * num_clients)
            cuts = (np.cumsum(p) * len(ids)).astype(int)[:-1]
            for k, part in enumerate(np.split(ids, cuts)):
                idx[k].extend(part.tolist())
        if min(len(i) for i in idx) >= min_size:
            return [np.array(sorted(i)) for i in idx]
    raise ValueError("could not satisfy min_size; raise alpha or lower num_clients")
