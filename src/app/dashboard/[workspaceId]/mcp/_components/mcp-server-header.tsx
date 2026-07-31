import Link from 'next/link'

type Props = {
    workspaceId: string
}

const McpServersHeader = ({ workspaceId }: Props) => {
    return (
        <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] text-muted-foreground">Servers deployed to your org.</p>
            <Link
                href={`/dashboard/${workspaceId}/browse`}
                className="h-8 px-3.5 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors flex items-center"
            >
                Browse MCPs
            </Link>
        </div>
    )
}

export default McpServersHeader