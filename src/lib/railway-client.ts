const RAILWAY_API_URL = "https://backboard.railway.com/graphql/v2"

type RailwayResponse<T> = {
  data?: T
  errors?: { message: string }[]
}

// Railway's API intermittently returns this exact vague error for requests
// that otherwise succeed on retry — confirmed repeatedly (identical requests
// failing then succeeding seconds later with no code change). Backs off
// exponentially before giving up.
//
// Budget kept deliberately tight: deployCustomTool chains up to ~7 sequential
// Railway calls in one server action invocation. If every call used its full
// worst-case backoff, the action could blow past a serverless function's
// execution timeout before Railway even recovers. Pair this with
// `maxDuration` set on the server action file, not just a bigger budget here.
const MAX_RETRIES = 4
const BASE_DELAY_MS = 800
const MAX_DELAY_MS = 6000

export const railwayRequest = async <T>(
  query: string,
  variables: Record<string, unknown>,
  attempt = 0
): Promise<T> => {
  const res = await fetch(RAILWAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RAILWAY_API_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  const json: RailwayResponse<T> = await res.json()

  if (json.errors?.length) {
    const message = json.errors.map((e) => e.message).join(", ")

    if (message.includes("Problem processing request") && attempt < MAX_RETRIES) {
      const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return railwayRequest<T>(query, variables, attempt + 1)
    }

    throw new Error(`Railway API error: ${message}`)
  }
  if (!json.data) {
    throw new Error("Railway API returned no data")
  }

  return json.data
}

// Fail fast with a clear message instead of letting every downstream call
// error out on a bad/missing auth header. Call this once at the top of any
// action that's about to make Railway calls.
export const assertRailwayConfigured = () => {
  if (!process.env.RAILWAY_API_TOKEN) {
    throw new Error(
      "RAILWAY_API_TOKEN is not set — add it to .env (Railway dashboard: Account Settings -> Tokens)"
    )
  }
}

export const RAILWAY_ME_QUERY = `
  query Me {
    me {
      workspaces {
        id
        name
      }
    }
  }
`

export const RAILWAY_PROJECT_CREATE = `
  mutation ProjectCreate($input: ProjectCreateInput!) {
    projectCreate(input: $input) {
      id
      name
      environments {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  }
`

// Deletes a Railway project outright — used to clean up after a FAILED
// deploy instead of leaving an orphaned, half-configured project sitting
// around. This is the direct fix for the "rapid project creation" pattern
// that likely triggered the free-plan provisioning error: every failed
// deploy used to leave its project behind permanently, so retries piled up
// real, counted projects instead of leaving no trace.
export const RAILWAY_PROJECT_DELETE = `
  mutation ProjectDelete($id: String!) {
    projectDelete(id: $id)
  }
`

export const RAILWAY_SERVICE_CREATE = `
  mutation ServiceCreate($input: ServiceCreateInput!) {
    serviceCreate(input: $input) {
      id
      name
    }
  }
`

export const RAILWAY_SERVICE_DOMAIN_CREATE = `
  mutation ServiceDomainCreate($input: ServiceDomainCreateInput!) {
    serviceDomainCreate(input: $input) {
      id
      domain
    }
  }
`

export const RAILWAY_DEPLOYMENT_STATUS_QUERY = `
  query DeploymentStatus($projectId: String!, $environmentId: String, $serviceId: String!) {
    deployments(
      input: { projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId }
      first: 1
    ) {
      edges {
        node {
          id
          status
          staticUrl
        }
      }
    }
  }
`

export const RAILWAY_VARIABLE_UPSERT = `
  mutation VariableUpsert($input: VariableUpsertInput!) {
    variableUpsert(input: $input)
  }
`

// serviceId and environmentId are separate top-level arguments here, NOT
// nested inside `input` — matches Railway's actual public API schema for
// this mutation (confirmed against docs.railway.com/guides/api-cookbook).
// `input` only takes instance-config fields like startCommand. The bug this
// comment used to describe (duplicating serviceId/environmentId inside
// input) has been moved to the CALL SITE in actions/deploy.ts — this
// mutation string itself was always correct; don't reintroduce the bug
// there.
export const RAILWAY_SERVICE_INSTANCE_UPDATE = `
  mutation ServiceInstanceUpdate($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
    serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
  }
`

// Caps CPU/memory for a single service instance. Without this, a service
// scales up to your PLAN's full ceiling by default — meaning one heavy
// deployed tool can consume the entire account's resource pool and starve
// every other tool, regardless of how big your plan is. Confirmed via
// Railway's own help forum. UNLIKE RAILWAY_SERVICE_INSTANCE_UPDATE above,
// this mutation takes a SINGLE `input` argument with serviceId,
// environmentId, vCPUs, and memoryGB all nested together inside it — do
// not split serviceId/environmentId out as separate top-level args here,
// that's the other mutation's shape, not this one's.
export const RAILWAY_SERVICE_INSTANCE_LIMITS_UPDATE = `
  mutation ServiceInstanceLimitsUpdate($input: ServiceInstanceLimitsUpdateInput!) {
    serviceInstanceLimitsUpdate(input: $input)
  }
`

export const RAILWAY_SERVICE_DEPLOY = `
  mutation ServiceInstanceDeploy($environmentId: String!, $serviceId: String!) {
    serviceInstanceDeployV2(environmentId: $environmentId, serviceId: $serviceId)
  }
`