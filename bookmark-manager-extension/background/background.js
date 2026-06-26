import { addBookmark } from '../shared/store.js';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: 'add-bookmark',
    title: 'Add page to My Bookmarks',
    contexts: ['page', 'link'],
  });

  chrome.contextMenus.create({
    id: 'add-bookmark-link',
    title: 'Add link to My Bookmarks',
    contexts: ['link'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'add-bookmark') {
    const url = info.pageUrl || tab?.url;
    const title = tab?.title || info.selectionText || url;
    if (!url) return;

    await addBookmark({
      title,
      url,
      pinned: false,
    });
  }

  if (info.menuItemId === 'add-bookmark-link') {
    const url = info.linkUrl;
    const title = info.selectionText || url;
    if (!url) return;

    await addBookmark({
      title,
      url,
      pinned: false,
    });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});
