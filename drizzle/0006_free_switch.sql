ALTER TABLE "crawl_audit" ADD COLUMN "http_last_modified" text;--> statement-breakpoint
ALTER TABLE "crawl_audit" ADD COLUMN "page_last_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "crawl_audit" ADD COLUMN "page_last_updated_text" text;--> statement-breakpoint
CREATE INDEX "crawl_audit_page_last_updated_at_idx" ON "crawl_audit" USING btree ("page_last_updated_at");--> statement-breakpoint
ALTER TABLE "crawl_audit" DROP COLUMN "last_modified";