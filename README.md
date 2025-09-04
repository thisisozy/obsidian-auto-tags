### AutoTags

**AutoTags** is an Obsidian plugin that automatically manages frontmatter tags based on the folder a note lives in. No more manual tag wrangling—just drop your files where they belong, and AutoTags keeps their metadata tidy.

---

### Features
- **Automatic tagging on file creation**

  New notes inherit tags from the folder (and optionally, parent folders).

- **Automatic updates on file movement**

  Move a file between folders and its tags will be updated — removed where appropriate, added where needed.

- **Folder-level configuration**

  Assign tags to any folder using the right-click context menu. Options include:

	- Recursive tagging (apply tags to all nested files)

	- Automatic removal when a file leaves the folder

- **Dynamic updates**

  Renaming or deleting folders updates AutoTags’ internal database automatically.

- **Frontmatter-based**

  Tags are written directly to your notes’ YAML frontmatter (--- blocks), keeping everything standard and portable.

- **Utilities in settings**

	- Refresh all automatic tags (handy if things get out of sync)

	- Reset the folder-tag database

---

### Installation

#### Easy way (recommended)

1. Download the `AutoTags.zip` from the latest [release](https://github.com/thisisozy/auto-tags/releases).

2. Unzip it into your vault’s `.obsidian/plugins/` folder. This should create a folder with `main.js`, `manifest.json`, and `styles.css` inside.

3. In Obsidian, go to `Settings` → `Community plugins` and enable AutoTags.

#### Manual way

1. Go to your vault’s `.obsidian/plugins/` folder.

2. Create a new folder called `auto-tags`.

3. Download `main.js`, `manifest.json`, and `styles.css` individually from the latest [release](https://github.com/thisisozy/auto-tags/releases) and put them in that folder.

4. Enable `AutoTags` in Obsidian settings.

---

### Usage

- Right-click any folder → `Automatic tags` to configure.

- Enter one or more tags (comma-separated).

- Toggle whether tags should apply recursively and/or be removed automatically on file move.

- Done! New and existing notes in that folder will stay up-to-date with your tag rules.

---

### Notes & Caveats
- Tags are stored in frontmatter. If your file doesn’t have frontmatter, AutoTags will create it.
- Be cautious with the `Refresh automatic tags` function — it rewrites tags for all files and could undo manual tweaks.
- Recursive tagging can affect a lot of files at once. Use wisely!

---

### Feedback
Found a bug? Got an idea? Open an [issue](https://github.com/thisisozy/auto-tags/issues) or contribute a [pull request](https://github.com/thisisozy/auto-tags/pulls).

---

### License
MIT License. See [License](./LICENSE) for details.
