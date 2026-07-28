// Run with: node test-railway-create.js
const RAILWAY_API_TOKEN = "d22a37a2-85ac-4d9e-bb77-0f55dc0e2ce3";
const WORKSPACE_ID = "9975f146-99de-4a21-8b2c-fe3d8f63ce27";

fetch("https://backboard.railway.com/graphql/v2", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RAILWAY_API_TOKEN}`,
    },
    body: JSON.stringify({
        query: `
      mutation ProjectCreate($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          id
          name
        }
      }
    `,
        variables: {
            input: {
                name: "test-project-manual",
                workspaceId: WORKSPACE_ID,
            },
        },
    }),
})
    .then((res) => res.json())
    .then((data) => console.log(JSON.stringify(data, null, 2)))
    .catch((err) => console.error("Request failed:", err));