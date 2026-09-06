import { useEffect, useState } from 'react';

/** Shared expand/collapse mount animation for sidebar tree children (keeps the
 * closing subtree mounted briefly so the collapse transition can play). */
export function useTreeChildrenMount(expanded: boolean, hasChildren: boolean) {
    const [childrenMounted, setChildrenMounted] = useState(expanded && hasChildren);
    const [childrenVisible, setChildrenVisible] = useState(expanded && hasChildren);
    useEffect(() => {
        if (!hasChildren) {
            setChildrenVisible(false);
            setChildrenMounted(false);
            return;
        }
        if (expanded) {
            setChildrenMounted(true);
            const openTimer = window.setTimeout(() => setChildrenVisible(true), 0);
            return () => window.clearTimeout(openTimer);
        }
        setChildrenVisible(false);
        const closeTimer = window.setTimeout(() => setChildrenMounted(false), 340);
        return () => window.clearTimeout(closeTimer);
    }, [expanded, hasChildren]);
    return { childrenMounted, childrenVisible };
}
