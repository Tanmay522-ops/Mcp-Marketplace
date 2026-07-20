type Props = {
    workspaceName: string
    senderName: string
    role: string
    acceptUrl: string
}

const InviteEmail = ({ workspaceName, senderName, role, acceptUrl }: Props) => {
    return (
        <div
            style={{
                fontFamily: 'Helvetica, Arial, sans-serif',
                backgroundColor: '#f4f4f5',
                padding: '40px 0',
            }}
        >
            <div
                style={{
                    maxWidth: '480px',
                    margin: '0 auto',
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    padding: '32px',
                    border: '1px solid #e5e7eb',
                }}
            >
                <h1 style={{ fontSize: '18px', color: '#111827', margin: '0 0 12px 0' }}>
                    You've been invited to {workspaceName}
                </h1>
                <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6', margin: '0 0 24px 0' }}>
                    {senderName} invited you to join <strong>{workspaceName}</strong> as{' '}
                    <strong>{role.toLowerCase()}</strong>.
                </p>
                <a
                    href={acceptUrl}
                    style={{
                        display: 'inline-block',
                        backgroundColor: '#111827',
                        color: '#ffffff',
                        fontSize: '14px',
                        fontWeight: 600,
                        padding: '10px 20px',
                        borderRadius: '8px',
                        textDecoration: 'none',
                    }}
                >
                    View invite
                </a>
                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '24px' }}>
                    If you weren't expecting this, you can safely ignore this email.
                </p>
            </div>
        </div >
    )
}

export default InviteEmail