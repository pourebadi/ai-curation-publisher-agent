# TASK 02 - Database and Lifecycle Engine

## Goal

تکمیل schema دیتابیس، repository layer و lifecycle transitionها.

## Scope

- D1 schema
- repositories
- lifecycle service
- status transition guard
- basic tests

## Files / Areas

- packages/db
- packages/core/lifecycle.ts
- packages/db/repositories

## Requirements

- همه جدول‌های ضروری طبق BLUEPRINT ساخته شوند.
- هر transition غیرمجاز reject شود.
- repositoryها interface واضح داشته باشند.
- timestamps استاندارد ذخیره شوند.

## Out of Scope

- provider واقعی
- AI واقعی
- Telegram publish

## Acceptance Criteria

- migrationها اجراپذیر باشند.
- repository tests پاس شوند.
- transition tests پاس شوند.
