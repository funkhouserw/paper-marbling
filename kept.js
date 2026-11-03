// Things the user keeps by name in this browser, so they survive reloading the page: scripts and palettes.
export function keptList(key, valid = () => true) {
  const list = (storage = localStorage) => {
    try {
      const found = JSON.parse(storage.getItem(key));
      return Array.isArray(found) ? found.filter(valid) : [];
    } catch {
      return [];
    }
  };
  return {
    list,
    // Saving under a name already in use replaces it. Names keep the order they were first saved in.
    save(entry, storage = localStorage) {
      const all = list(storage);
      const at = all.findIndex((e) => e.name === entry.name);
      if (at >= 0) all[at] = entry;
      else all.push(entry);
      storage.setItem(key, JSON.stringify(all));
      return entry;
    },
    remove(name, storage = localStorage) {
      storage.setItem(key, JSON.stringify(list(storage).filter((e) => e.name !== name)));
    },
  };
}
