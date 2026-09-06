import { Menu } from './overlay';
import { FolderRow } from './hub-folder-row';
import { useHubFolderItem, type HubFolderItemProps } from './use-hub-folder-item';

export function HubFolderItem(props: HubFolderItemProps) {
    const h = useHubFolderItem(props)
    return (
        <div className="flex flex-col">
            <FolderRow {...h.row} />
            <Menu
                open={h.isMenuOpen}
                anchor={h.moreButtonRef}
                items={h.menuItems}
                onClose={() => h.setIsMenuOpen(false)}
            />
            {h.contextMenu.point && (
                <Menu open anchor={h.contextMenu.point} items={h.menuItems} onClose={h.contextMenu.close} />
            )}
            {props.children}
        </div>
    )
}