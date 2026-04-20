# Project-local Rules

## Project identity
- Project: template-c-poc-dev
- Repo: bysontech/template-c-poc-dev
- Owner/Brand: BysonTech

## Tech stack (brief)
- Design-only (no implementation)
- Promotion target blueprint for Template B -> C
- Documents the "upgrade path" when a client-side PWA (Template B) needs server capabilities

## Allowed change areas
- Safe paths: README.md, docs/, .github/, scripts/
- Avoid paths: (none - this repo has no application code)

## Commands (must be accurate)
- Install: N/A
- Lint: N/A
- Typecheck: N/A
- Test: N/A
- Build: N/A

## Definition of Done
- docs の整備が完了している
- B->C 昇格の判断基準が明確である
- 差し替えポイント（データ層・認証）の契約が文書化されている
- 技術選定は「候補」として記載し、確定していないこと

## Notes
- このリポは実装コードを持たない。設計・運用の型を固定するためのもの
- テンプレCは"常用しない"。BからCへの昇格が必要になったときだけ参照する
- 技術選定（Supabase/Firebase/D1等）の確定はこのリポでは行わない
