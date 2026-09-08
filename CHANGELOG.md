# Changelog

All notable changes to Lingua Studio are documented here. Release notes are reused by the GitHub Release workflow.

## [0.1.0] - 2026-09-08

The first public desktop release of Lingua Studio.

### Added

- Japanese, English, and Korean learning tracks with a learner profile and daily goals.
- Japanese kana studio with hiragana/katakana practice, romaji input, confusion-aware repetition, and AI tutoring context.
- Adaptive practice, multi-dimensional grading, mistake sprints, learner radar, FSRS spaced repetition, and card drafting.
- Reading, writing, listening, pitch-accent, textbook, dictionary, and Anki workflows.
- AI tutoring through the provider-agnostic Agent Gateway with WebSocket streaming and offline fallbacks.
- TTS voice preferences, optional neural voice providers, and on-demand licensed offline dictionary packages.
- Tauri desktop packaging for Windows, macOS, and Linux with a local Gateway sidecar.
- Signed GitHub Releases with automatic update checks and updater artifacts.

### Data safety

- Learning data is stored in the application data directory, separate from the installed application bundle.
- Updates replace the application bundle only; user profiles, study records, cards, mistakes, preferences, and databases are retained.
- Database migrations are additive and the desktop settings panel provides a database backup action.

