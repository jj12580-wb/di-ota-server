package main

import (
	"log"

	"ota-server/backend/internal/config"
	"ota-server/backend/internal/db"
	"ota-server/backend/internal/server"
	"ota-server/backend/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config failed: %v", err)
	}

	pg, err := db.OpenPostgres(cfg.Postgres.DSN())
	if err != nil {
		log.Fatalf("init postgres failed: %v", err)
	}
	defer pg.Close()

	if cfg.API.AutoMigrateOnStart {
		for _, f := range []string{"migrations/001_init.sql", "migrations/002_enhance.sql"} {
			if err := db.ApplySchema(pg, f); err != nil {
				log.Fatalf("apply schema %s failed: %v", f, err)
			}
		}
		log.Printf("schema applied at startup (API_AUTO_MIGRATE_ON_START=true)")
	}

	queries := store.New(pg)
	r := server.NewRouter(cfg, queries)
	addr := ":" + cfg.API.Port
	log.Printf("ota-api listening on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("start api failed: %v", err)
	}
}
