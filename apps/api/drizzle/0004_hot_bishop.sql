CREATE TABLE "usage_daily" (
	"day" date NOT NULL,
	"event" text NOT NULL,
	"platform" text NOT NULL,
	"app_version" text DEFAULT '' NOT NULL,
	"prop_key" text DEFAULT '' NOT NULL,
	"prop_value" text DEFAULT '' NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_daily_day_event_platform_app_version_prop_key_prop_value_pk" PRIMARY KEY("day","event","platform","app_version","prop_key","prop_value")
);
--> statement-breakpoint
CREATE INDEX "usage_daily_event_day_idx" ON "usage_daily" USING btree ("event","day");