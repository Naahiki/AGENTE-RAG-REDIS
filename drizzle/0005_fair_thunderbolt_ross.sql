ALTER TABLE "ayudas" ADD COLUMN "http_last_modified" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "page_last_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "page_last_updated_text" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "last_embedded_text_hash" text;--> statement-breakpoint
CREATE INDEX "ayudas_page_last_updated_at_idx" ON "ayudas" USING btree ("page_last_updated_at");--> statement-breakpoint
ALTER TABLE "ayudas" DROP COLUMN "last_modified";