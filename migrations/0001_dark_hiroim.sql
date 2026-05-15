CREATE TABLE "data_pool_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_pool_id" uuid NOT NULL,
	"key_value" varchar(255) NOT NULL,
	"reason" text,
	"excluded_by_user_id" varchar(21),
	"excluded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_pool_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_pool_id" uuid NOT NULL,
	"form_instance_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"key_field" varchar(100) NOT NULL,
	"additional_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "data_pools_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "excluded_from_data_pools" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "data_pool_exclusions" ADD CONSTRAINT "data_pool_exclusions_data_pool_id_data_pools_id_fk" FOREIGN KEY ("data_pool_id") REFERENCES "public"."data_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_pool_exclusions" ADD CONSTRAINT "data_pool_exclusions_excluded_by_user_id_users_id_fk" FOREIGN KEY ("excluded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_pool_sources" ADD CONSTRAINT "data_pool_sources_data_pool_id_data_pools_id_fk" FOREIGN KEY ("data_pool_id") REFERENCES "public"."data_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_pool_sources" ADD CONSTRAINT "data_pool_sources_form_instance_id_form_instances_id_fk" FOREIGN KEY ("form_instance_id") REFERENCES "public"."form_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dpe_data_pool_id" ON "data_pool_exclusions" USING btree ("data_pool_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_dpe_pool_value" ON "data_pool_exclusions" USING btree ("data_pool_id","key_value");--> statement-breakpoint
CREATE INDEX "idx_dps_data_pool_id" ON "data_pool_sources" USING btree ("data_pool_id");--> statement-breakpoint
CREATE INDEX "idx_dps_form_instance_id" ON "data_pool_sources" USING btree ("form_instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_dps_pool_form" ON "data_pool_sources" USING btree ("data_pool_id","form_instance_id");