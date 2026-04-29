---
name: docker-compose-dev
description: Start, verify, troubleshoot, and stop OTA server dev environment with Docker Compose.
---

# Docker Compose Dev Skill

Use this skill when you need to run the local OTA dev stack.

## Preconditions

- Run commands from repository root.
- Ensure Docker Engine and Docker Compose plugin are available.
- Ensure .env exists. If missing, create it from .env.example.

## Start Dev Stack

```bash
cd /home/xu/workspace/ota-server
cp -n .env.example .env

docker compose up -d
```

## Verify Services

```bash
cd /home/xu/workspace/ota-server
docker compose ps
curl -i http://localhost:8080/healthz
```

Expected result:
- Core services are Up/Healthy: postgres, redis, rabbitmq, ota-api, ota-worker, ota-console.
- API health endpoint returns HTTP 200.

## Common Access URLs

- API: http://localhost:8080/healthz
- Console: http://localhost:5173
- RabbitMQ: http://localhost:15672
- Keycloak: http://localhost:18080
- MinIO: http://localhost:9001

## Troubleshooting

Show logs of all services:

```bash
cd /home/xu/workspace/ota-server
docker compose logs --tail=200
```

Show logs for a specific service:

```bash
cd /home/xu/workspace/ota-server
docker compose logs -f ota-api
docker compose logs -f ota-worker
```

Rebuild and restart if code or dependency state is stale:

```bash
cd /home/xu/workspace/ota-server
docker compose up -d --build --force-recreate
```

## Stop Dev Stack

Stop only:

```bash
cd /home/xu/workspace/ota-server
docker compose down
```

Stop and remove volumes (data reset):

```bash
cd /home/xu/workspace/ota-server
docker compose down -v
```

## Optional: Staging Overlay

Use the staging overrides on top of dev compose:

```bash
cd /home/xu/workspace/ota-server
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d
```
