CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" varchar(64) NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"meta" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" varchar(64) NOT NULL,
	"summary_text" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_facts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(64),
	"chat_id" varchar(64) NOT NULL,
	"fact_text" text NOT NULL,
	"source" varchar(64),
	"confidence" integer DEFAULT 80,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "memory_facts_chat_id_idx" ON "memory_facts" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "memory_facts_user_id_idx" ON "memory_facts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memory_facts_created_at_idx" ON "memory_facts" USING btree ("created_at");