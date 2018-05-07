drop table rate_template_update;

create table rate_template_update
(
`uid` varchar(10) not null,
`hotel_id` varchar(10) not null,
`rate_code` varchar(10) not null,
`rate_type_class_code` text default '',
`currency_code` text default '',
`rate_type_name` text default '',
`default_short_description` text default '',
`default_long_description` text default '',
`active` text default '',
`negotiated` text default '',
`include_tax_by_default` text default '',
`commission_policy` text default '',
`default_guarantee_policy` text default '',
`default_cancel_policy` text default '',
`breakfast_included_in_rate` text default '',
`meal_plan` text default '',
`rate_category_code` text default '',
`derive_type` text default '',
`derive_rate_code` text default '',
`default_price` text default '',
 UNIQUE KEY `rate_template_key` (`uid`, `hotel_id`,`rate_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

drop table price_season_template;

create table price_season_template
(
`uid` varchar(10) not null,
`hotel_id` varchar(10) not null,
`rate_code` varchar(10) not null,
`start_day` text default '',
`start_month` text default '',
`start_year` text default '',
`end_day` text default '',
`end_month` text default '',
`end_year` text default '',
`no_end_date` text default '',
`room_code` varchar(10) not null,
`base_price` text default '',
`derived_formula` text default '',
`factor` text default '',
`include_tax_by_default` text default '',
 KEY `price_season_template_key` (`uid`, `hotel_id`,`rate_code`),
 KEY `price_season_template_key_2` (`uid`, `hotel_id`,`rate_code`,`room_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

drop table hotel_rate_audit;

create table hotel_rate_audit
(
`uid` varchar(10) not null,
`property_hotel_name` text default '',
`property_hotel_id` varchar(10) not null,
`codes_redx_rate_type_code` varchar(10) not null,
`mapping_amadeus` text default '',
`mapping_galileo` text default '',
`mapping_sabre` text default '',
`mapping_worldspan` text default '',
 KEY `hotel_rate_audit_key` (`uid`, `property_hotel_id`,`codes_redx_rate_type_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

