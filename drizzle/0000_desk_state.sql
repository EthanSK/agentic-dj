CREATE TABLE `desk_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
