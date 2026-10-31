/* Resolve explicit booleans without persisting inherited values. */
window.notesBooleanProperty = (block, key) => {
  const value = (block?.content || block?.["block/content"])?.match(
    new RegExp(`^\\s*${key}::[ \\t]*(true|false)[ \\t]*$`, "im"))?.[1]
    ?? (block?.properties || block?.["block/properties"])?.[key]
    ?? block?.properties?.[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
  return value === true || value === "true" ? true
    : value === false || value === "false" ? false : undefined;
};
window.notesInheritedProperties = async (block, keys) => {
  const api = window.logseq?.api;
  const result = {};
  const take = (node) => {
    for (const key of keys) if (result[key] === undefined)
      result[key] = window.notesBooleanProperty(node, key);
  };
  take(block);
  const seen = new Set();
  let parent = block?.parent;
  const ref = value => value?.id ?? value?.uuid ?? value;
  const pageId = ref(block?.page);
  while (parent && ref(parent) !== pageId && !seen.has(ref(parent))) {
    seen.add(ref(parent));
    const node = await api.get_block?.(ref(parent));
    if (!node) break;
    take(node); parent = node.parent;
  }
  if (pageId != null) {
    const page = await api.get_page?.(pageId);
    const name = page?.name || page?.originalName;
    const tree = name && await api.get_page_blocks_tree?.(name);
    // Tree fallback also covers API responses without parent references.
    const find = (nodes, ancestors = []) => {
      for (const node of nodes || []) {
        if (node.uuid === block.uuid) return ancestors;
        const found = find(node.children, [node, ...ancestors]);
        if (found) return found;
      }
    };
    for (const ancestor of find(tree) || []) take(ancestor);
    take(tree?.find(node => node.preBlock || node["pre-block?"]));
    take(page);
  }
  return result;
};
