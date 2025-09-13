CREATE TABLE "ayudas" (
	"id" serial PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"requisitos" text,
	"procedimiento" text,
	"url_oficial" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"hash_contenido" text
);
