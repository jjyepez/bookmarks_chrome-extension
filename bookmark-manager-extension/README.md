# Bookmark Manager

A Chrome extension (Manifest V3) that replaces the default side panel with a full-featured bookmark and notes manager.

## Features

### Bookmarks

- **Pinned, Recent, Folders** — three organized sections in the side panel
- **Full CRUD** — add, edit, delete bookmarks and folders via modals
- **Drag & drop** — drop URLs from the browser into any folder, pinned section, or root level
- **Search** — real-time filtering by title, URL, and label; single "Results" section while searching
- **Move to folder** — move bookmarks between folders via a context submenu
- **Favicons** — automatically loaded from Google S2 favicon service
- **Labels & colors** — optional visual metadata per bookmark

### Notes (Sticky Notes)

- **Masonry layout** — Pinterest-style column layout
- **Full CRUD** — create instantly, edit inline (contenteditable), edit title/tag/color/date via modal
- **Soft delete** — deleted notes are hidden but recoverable via search (shown with line-through)
- **Pin notes** — pinned notes appear first
- **Due dates** — visual alert (red border) when overdue
- **10 color swatches** — plus a native color picker
- **Tags** — optional tag per note

### Views & Navigation

- **Bookmarks / Notes toggle** — segmented control in the header, view persists across sessions
- **Sections collapse** — click section headers to collapse/expand, state persisted
- **Search bar** — toggle visibility, context-aware placeholder and filtering

### Context Menus

- **Bookmarks**: Open, Edit, Pin/Unpin, Move to Folder, Delete
- **Folders**: Add bookmark, Add current tab, Edit Folder, Delete Folder (with child protection)
- **Notes**: Edit (modal), Color (10 swatches), Pin/Unpin, Delete (soft)
- **Sections (Pinned/Recent/Folders)**: Add current tab, Add bookmark, Create folder

### Theming

- **System / Light / Dark** — selectable from options page, applies immediately
- **CSS variables** — full dark palette with `prefers-color-scheme` fallback

### Options Page

- **Statistics** — total bookmarks, folders, pinned counts
- **Import from Chrome** — replicates the native Chrome bookmark tree
- **Export / Import JSON** — full data backup and restore
- **Clear all data** — double-confirmation safety
- **Sidebar title** — customizable text shown in the panel header
- **Show URL** — toggle URL visibility in bookmark items
- **Theme selector** — system / light / dark

### Background Service Worker

- **Context menus** — right-click on any page or link to add it as a bookmark
- **Side panel** — opens automatically when the extension icon is clicked

## Data Model

All data is stored locally in `chrome.storage.local` under the key `bm_data`.

```js
{
  version: 3,
  folders: [{ id, name, color, label, parentId, system, createdAt }],
  bookmarks: [{ id, title, url, folderId, color, label, pinned, createdAt, updatedAt }],
  notes: [{ id, content, color, title, tag, dueDate, pinned, deleted, createdAt, updatedAt }]
}
```

Additional storage keys: `bm_theme`, `bm_show_url`, `bm_sidebar_title`, `bm_active_view`, `bm_collapsed_sections`, `bm_search_visible`.

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `bookmark-manager-extension/` folder

## Project Structure

```
bookmark-manager-extension/
├── manifest.json
├── _locales/en/messages.json
├── background/background.js
├── icons/icon{16,48,128}.png, icon.svg
├── options/options.{html,js}
├── shared/store.js
├── sidepanel/sidepanel.{html,js,css}
└── res/
```

## Dependencies

No npm packages or build tools. Vanilla JavaScript (ES modules), CSS, HTML.

- **Material Symbols** — icon set (Google Fonts CDN)
- **Google S2 Favicons** — bookmark favicon service

## Development

The project follows Gitflow: `main` (production), `develop` (integration), `feature/*`, `hotfix/*`, `release/*`.

```bash
git checkout develop
git checkout -b feature/my-feature
# make changes
git add . && git commit -m "feat: description"
git checkout develop && git merge --no-ff feature/my-feature
```
