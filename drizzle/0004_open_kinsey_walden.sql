CREATE TYPE "public"."crawl_outcome" AS ENUM('UNCHANGED', 'SOFT_CHANGED', 'CHANGED', 'GONE', 'BLOCKED', 'ERROR');--> statement-breakpoint
CREATE TABLE "crawl_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"ayuda_id" integer NOT NULL,
	"url" text NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL,
	"http_status" integer,
	"duration_ms" integer,
	"etag" text,
	"last_modified" text,
	"raw_hash" text,
	"diff_score" real,
	"outcome" "crawl_outcome",
	"content_bytes" integer,
	"notes" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "embed_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"ayuda_id" integer NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL,
	"provider" text,
	"model" text,
	"dim" integer,
	"text_hash" text,
	"content_version" integer,
	"duration_ms" integer,
	"token_usage" jsonb,
	"store_key" text,
	"meta" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "scrape_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"ayuda_id" integer NOT NULL,
	"url" text NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL,
	"extractor" text,
	"text_hash" text,
	"text_len" integer,
	"lang" text,
	"meta" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "last_modified" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "content_bytes" integer;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "raw_hash" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "text_hash" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "content_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "last_crawled_at" timestamp;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "last_scraped_at" timestamp;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "last_embedded_at" timestamp;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "last_crawl_outcome" "crawl_outcome";--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "last_scrape_ok" boolean;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "last_embed_ok" boolean;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "crawl_audit" ADD CONSTRAINT "crawl_audit_ayuda_id_ayudas_id_fk" FOREIGN KEY ("ayuda_id") REFERENCES "public"."ayudas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embed_audit" ADD CONSTRAINT "embed_audit_ayuda_id_ayudas_id_fk" FOREIGN KEY ("ayuda_id") REFERENCES "public"."ayudas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_audit" ADD CONSTRAINT "scrape_audit_ayuda_id_ayudas_id_fk" FOREIGN KEY ("ayuda_id") REFERENCES "public"."ayudas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crawl_audit_ayuda_id_idx" ON "crawl_audit" USING btree ("ayuda_id");--> statement-breakpoint
CREATE INDEX "crawl_audit_ts_idx" ON "crawl_audit" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "crawl_audit_url_idx" ON "crawl_audit" USING btree ("url");--> statement-breakpoint
CREATE INDEX "crawl_audit_outcome_idx" ON "crawl_audit" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "embed_audit_ayuda_id_idx" ON "embed_audit" USING btree ("ayuda_id");--> statement-breakpoint
CREATE INDEX "embed_audit_ts_idx" ON "embed_audit" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "embed_audit_text_hash_idx" ON "embed_audit" USING btree ("text_hash");--> statement-breakpoint
CREATE INDEX "embed_audit_model_idx" ON "embed_audit" USING btree ("model");--> statement-breakpoint
CREATE INDEX "scrape_audit_ayuda_id_idx" ON "scrape_audit" USING btree ("ayuda_id");--> statement-breakpoint
CREATE INDEX "scrape_audit_ts_idx" ON "scrape_audit" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "scrape_audit_url_idx" ON "scrape_audit" USING btree ("url");--> statement-breakpoint
CREATE INDEX "scrape_audit_text_hash_idx" ON "scrape_audit" USING btree ("text_hash");--> statement-breakpoint
CREATE INDEX "ayudas_url_oficial_idx" ON "ayudas" USING btree ("url_oficial");--> statement-breakpoint
CREATE INDEX "ayudas_text_hash_idx" ON "ayudas" USING btree ("text_hash");--> statement-breakpoint
CREATE INDEX "ayudas_raw_hash_idx" ON "ayudas" USING btree ("raw_hash");--> statement-breakpoint
CREATE INDEX "ayudas_last_crawled_at_idx" ON "ayudas" USING btree ("last_crawled_at");--> statement-breakpoint
CREATE INDEX "ayudas_last_scraped_at_idx" ON "ayudas" USING btree ("last_scraped_at");--> statement-breakpoint
CREATE INDEX "ayudas_last_embedded_at_idx" ON "ayudas" USING btree ("last_embedded_at");