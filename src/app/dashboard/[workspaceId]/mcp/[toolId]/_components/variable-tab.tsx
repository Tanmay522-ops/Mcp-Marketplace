"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { getToolVariables, saveToolVariable, ToolVariableRow } from "@/actions/variable-tabs"

type Props = {
    workspaceId: string
    toolVersionId: string
}

const VariableRow = ({ variable, workspaceId }: { variable: ToolVariableRow; workspaceId: string }) => {
    const [value, setValue] = useState("")
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: (v: string) => saveToolVariable(workspaceId, variable.id, v),
        onSuccess: (result) => {
            if (result.status !== 200) {
                toast(result.message ?? "Failed to save")
                return
            }
            setValue("")
            toast(`${variable.key} saved`)
            queryClient.invalidateQueries({ queryKey: ["tool-variables", workspaceId, variable.id] })
        },
        onError: () => toast("Failed to save — try again"),
    })

    return (
        <div className="flex items-start justify-between gap-4 py-4 border-t border-border/50 first:border-t-0">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[12.5px] font-semibold text-foreground">{variable.key}</span>
                    <Badge variant={variable.required ? "default" : "secondary"} className="text-[10px]">
                        {variable.required ? "required" : "optional"}
                    </Badge>
                </div>
                {variable.description && (
                    <p className="mt-1 text-[12.5px] text-muted-foreground">{variable.description}</p>
                )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <Input
                    type="password"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={variable.hasValue ? "••••••••" : "value"}
                    className="w-56 h-8 text-[12.5px]"
                />
                <Button
                    size="sm"
                    onClick={() => value.trim() && mutation.mutate(value)}
                    disabled={!value.trim() || mutation.isPending}
                >
                    {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                </Button>
            </div>
        </div>
    )
}

const VariablesTab = ({ workspaceId, toolVersionId }: Props) => {
    const { data: result, isLoading } = useQuery({
        queryKey: ["tool-variables", workspaceId, toolVersionId],
        queryFn: () => getToolVariables(workspaceId, toolVersionId),
    })

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 py-10 text-[12.5px] text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading variables…
            </div>
        )
    }

    if (!result || result.status !== 200) {
        return (
            <p className="py-10 text-[12.5px] text-muted-foreground">
                {result?.message ?? "Couldn't load variables."}
            </p>
        )
    }

    if (result.data.length === 0) {
        return <p className="py-10 text-[12.5px] text-muted-foreground">This tool has no configurable variables.</p>
    }

    return (
        <div className="rounded-xl border border-border/50 bg-card px-5 py-1">
            <div className="pt-4 pb-1">
                <h3 className="text-[13px] font-semibold text-foreground">My Credentials</h3>
                <p className="text-[12px] text-muted-foreground">Your personal API keys for this server</p>
            </div>
            {result.data.map((variable) => (
                <VariableRow key={variable.id} variable={variable} workspaceId={workspaceId} />
            ))}
        </div>
    )
}

export default VariablesTab