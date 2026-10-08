# Contributing

Contributions from CIC members are welcome. For a feature or larger change, open a GitHub Issue first so the problem and scope can be agreed before implementation.

Good contributions include bug fixes, usability and accessibility improvements, tests, documentation, small refactors, and work that improves an existing Cappy Hub workflow. Keep each change focused and avoid unrelated systems or features.

If you want to work on an existing Issue, leave a comment so multiple contributors do not duplicate the work.

Have an idea? Open an Issue describing the problem, what you think should change, and why it would improve Cappy Hub. You do not need to know the implementation in advance.

## Issue hygiene

Before opening an Issue, search both open and closed Issues for the same requirement. Extend the canonical open Issue when the scope is genuinely the same. Create a new Issue when the requirement can be implemented independently or intentionally changes a settled product decision. Keep one canonical Issue responsible for one implementation scope.

For a true duplicate, close the duplicate with GitHub's duplicate reason when available and link the canonical Issue. Keep one acceptance-criteria list rather than maintaining parallel lists. When a newer decision supersedes an older one, leave the older Issue closed as historical evidence; link the newer Issue where practical and state which decision it supersedes.

After accepted behavior is implemented, update the Product & Technical Specification when it materially changes product behavior. Keep `docs/design.md` focused on visual and UI guidance; it does not define product semantics. The active Issue is the implementation boundary. Surface unrelated work separately instead of bundling nearby cleanup.
