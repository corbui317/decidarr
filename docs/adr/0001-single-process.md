# Decidarr runs as a single process

Decidarr is deployed as one container running one Node process, plus MongoDB.
We rely on that: the login rate-limit store and the secret-migration guard live in process memory, and nothing coordinates across instances.
Running more than one instance is unsupported; supporting it would mean moving that state into MongoDB or a shared store like Redis, which a self-hosted household app does not need.
