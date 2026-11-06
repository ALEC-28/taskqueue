# Node <-> Python HTTP contract (v1, LOCKED)

Weights never travel over HTTP. Shared volume: `FL_STORE` (default `./fl_store`).
- global model : `{FL_STORE}/{run_id}/global_v{n}.pt`
- client update: `{FL_STORE}/{run_id}/r{round}/{client_id}.pt`

## Python endpoints (called by TaskQueue worker)
All return `202 {"accepted": true}` immediately; result is delivered via callback.

### POST /fl/train
{ "step_id","run_id","client_id","round","model_version",
  "algorithm":"fedavg|fedprox","mu":0.01,"local_epochs":1,"lr":0.01,"batch_size":32,
  "seed":42,"dataset":"mnist","num_clients":20,"alpha":0.5,"partition_index":3 }

### POST /fl/aggregate
{ "step_id","run_id","round","model_version","algorithm",
  "updates":[{"client_id","num_samples"}] }   // reads r{round}/{client_id}.pt, writes global_v{model_version+1}.pt

### POST /fl/evaluate
{ "step_id","run_id","round","model_version","dataset":"mnist" }

## Callback (Python -> Node): POST /internal/step-complete
{ "step_id","status":"done|failed","error":null,
  "result": { ...step-specific } }

result by step:
- train    : {client_id,round,num_samples,train_loss,duration_ms}
- aggregate: {round,new_model_version,n_clients}
- evaluate : {round,model_version,accuracy,loss}

## Rules
- Idempotent on `step_id` (retry-safe; requeue after crash re-sends same step_id).
- Failure injection (dropout/slowdown) stays in Node (`shouldFail`); Python trains honestly. Node sends `failed` itself for dropped clients.
- `partition_index` + `seed` + `alpha` + `num_clients` deterministically reproduce the client's data shard.

## Amendment 1: POST /fl/init
{ "run_id","seed" } -> 200 {"model_version":0}. Creates `global_v0.pt`. Call once per run before round 1 (synchronous, no callback).
Aggregate bumps version: evaluate must use `new_model_version` from the aggregate result.
