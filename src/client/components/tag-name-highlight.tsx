/** Renders a tag name with the matched query substring emphasized, used by tag pickers. */
export function TagNameHighlight({ name, query }: {
    name: string;
    query: string;
}) {
    const q = query.trim().toLocaleLowerCase();
    const index = q ? name.toLocaleLowerCase().indexOf(q) : -1;
    if (index < 0)
        return name;
    return (<>
        {name.slice(0, index)}
        <span className="font-medium text-[var(--accent)]">{name.slice(index, index + q.length)}</span>
        {name.slice(index + q.length)}
    </>);
}