# Agent Operating Guide

このファイルは作業の進め方を定義する。製品仕様は docs/ 配下を参照。

## このリポの特性

- **設計書リポ** である。実装コードは含まない
- ドキュメントの整備・更新が主な作業
- ビルド・テストは不要

## Roles

- **Architect:**
  - 昇格基準の整理、設計指針の策定
  - 差し替えポイントの定義
  - ドキュメント構成の設計

- **Writer:**
  - ドキュメントの執筆・更新
  - decision_log への記録
  - READMEの維持

- **Reviewer:**
  - ドキュメントの正確性・一貫性チェック
  - 過剰な実装詳細が含まれていないか確認

## Task intake

- docs/ 配下のドキュメント更新がメイン
- 実装コードの追加は行わない

## PR rules

- No direct push to main
- PR must include:
  - What / Why
  - 変更したドキュメントの要点
- How to test / Build は N/A

## Safety & security

- Never commit secrets
- このリポに実装コードや設定ファイル（wrangler.toml等）を追加しない

## Communication style

- 簡潔に、実務的に
- コード例は「説明のため」であり、動作する実装ではない
