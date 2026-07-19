"use client"
import { QueryClient, QueryClientProvider, isServer } from '@tanstack/react-query'
import React, { useState } from 'react'

type Props = {
    children: React.ReactNode
}

function makeQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60 * 1000,
            },
        },
    })
}

let browserQueryClient: QueryClient | undefined = undefined

function getQueryClient() {
    if (isServer) {
        return makeQueryClient()  // always new on server
    } else {
        if (!browserQueryClient) browserQueryClient = makeQueryClient()
        return browserQueryClient  // reuse on client
    }
}

const ReactQueryProvider = ({ children }: Props) => {
    const client = getQueryClient()

    return (
        <QueryClientProvider client={client}>
            {children}
        </QueryClientProvider>
    )
}

export default ReactQueryProvider