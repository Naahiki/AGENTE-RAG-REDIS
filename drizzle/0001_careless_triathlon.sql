ALTER TABLE "ayudas" ADD COLUMN "estado_tramite" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "tipo_tramite" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "tema_subtema" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "nombre" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "dirigido_a" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "normativa" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "documentacion" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "resultados" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "otros" text;--> statement-breakpoint
ALTER TABLE "ayudas" ADD COLUMN "servicio" text;--> statement-breakpoint
ALTER TABLE "ayudas" DROP COLUMN "titulo";--> statement-breakpoint
ALTER TABLE "ayudas" DROP COLUMN "requisitos";--> statement-breakpoint
ALTER TABLE "ayudas" DROP COLUMN "procedimiento";