CREATE TABLE "chat_sessions" (
	"chat_id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "message_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"url" text NOT NULL,
	"rank" integer NOT NULL,
	"score" real,
	"raw_chunk" jsonb
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "meta" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "message_sources" ADD CONSTRAINT "message_sources_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_sessions_last_activity_idx" ON "chat_sessions" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_sources_message_id_idx" ON "message_sources" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_sources_url_idx" ON "message_sources" USING btree ("url");--> statement-breakpoint
CREATE INDEX "chat_messages_chat_time_idx" ON "chat_messages" USING btree ("chat_id","created_at");