# Phase 7.3 Language-aware AI fallback

## Goal
Fallback behavior must work for every category/language, not only Persian.

## Changes
- AI fallback copy is generated based on target output language.
- fa/en/ar/tr have localized fallback messages.
- Unknown languages fall back to English.
- Technical provider/parser errors are stripped from Telegram review captions.
- Raw source URL attribution is not injected into fallback review captions.

## Product rule
Each route output has one active prompt. Fallback is per output language.
