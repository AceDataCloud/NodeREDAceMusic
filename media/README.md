# Ace Data Cloud media for Node-RED

<img src="https://avatars.githubusercontent.com/u/156096448?s=192&amp;v=4" alt="" width="64" height="64">

Generate music with Suno or ACE Music, images with Nano Banana, GPT Image, Seedream or FLUX, and video with Seedance, Kling, Veo or Hailuo. The **Ace media generate** node submits one job per input. The **Ace media task** node looks up an existing job and routes the available media.

## Install

Search for `@acedatacloud/node-red-media` in **Manage palette → Install**, or run this command in your Node-RED user directory and restart Node-RED.

```sh
npm install @acedatacloud/node-red-media
```

Use Node.js 22+ and Node-RED 4 or 5. Find the two flow nodes in the **network** category. The separate `@acedatacloud/node-red-acemusic` package continues to handle flows using the original ACE Music task node.

## Submit a job

1. Add **Ace media generate**, select a service, and configure an account with an [Ace Data Cloud application token](https://platform.acedata.cloud/console/applications?utm_source=opensource&utm_medium=referral&utm_campaign=evergreen) that can access that service. Node-RED stores the token in the shared account's password credential.
2. Connect an Inject node configured to send JSON. Select a request from the table or use the service's linked API contract for its supported settings. The node sets `async: true` and sends one request per input. Submitting a job can incur charges.
3. Save the returned task ID from `msg.payload`. The node also sets `msg.aceService` for downstream task lookup. A Catch node receives request errors. If a submission times out, check your application history before retrying.

| Service and request format | Example input in `msg.payload` |
| --- | --- |
| [Suno](https://docs.acedata.cloud/openapi/suno.json) | `{"action":"generate","prompt":"An upbeat instrumental about a paper boat","instrumental":true}` |
| [ACE Music](https://docs.acedata.cloud/openapi/acemusic.json) | `{"action":"generate","prompt":"An upbeat song about a paper boat"}` |
| [Nano Banana](https://docs.acedata.cloud/openapi/nano-banana.json) | `{"action":"generate","prompt":"A paper boat on a pond"}` |
| [GPT Image](https://docs.acedata.cloud/openapi/openai.json) | `{"model":"gpt-image-2","prompt":"A paper boat on a pond"}` |
| [Seedream](https://docs.acedata.cloud/openapi/seedream.json) | `{"model":"doubao-seedream-5-0-lite-260128","prompt":"A paper boat on a pond"}` |
| [FLUX](https://docs.acedata.cloud/openapi/flux.json) | `{"action":"generate","prompt":"A paper boat on a pond","size":"1024x1024"}` |
| [Seedance](https://docs.acedata.cloud/openapi/seedance.json) | `{"model":"doubao-seedance-1-5-pro-251215","content":[{"type":"text","text":"A paper boat drifting on a pond"}]}` |
| [Kling](https://docs.acedata.cloud/openapi/kling.json) | `{"action":"text2video","prompt":"A paper boat drifting on a pond"}` |
| [Veo](https://docs.acedata.cloud/openapi/veo.json) | `{"action":"text2video","prompt":"A paper boat drifting on a pond"}` |
| [Hailuo](https://docs.acedata.cloud/openapi/hailuo.json) | `{"action":"generate","model":"minimax-t2v","prompt":"A paper boat drifting on a pond"}` |

## Check an existing task

Import **Examples → @acedatacloud/node-red-media → Check a media task**. Select the service and account that created your task and put its ID in the Inject node's string payload. Deploy the flow and click Inject to perform one lookup.

Both outputs preserve other message properties and set `msg.payload` to an object containing `id`, `service`, `state` and `assets`. On the first output, an asset contains its `type` (audio, image or video) and its HTTPS `url`. GPT Image and Seedream can also return inline image data as `b64_json`. The node reads primary media such as a Suno track's audio, a Seedance task's content video or a Kling task's top-level video. A partial task can already contain media.

The second output carries tasks without media. Inspect `state` before deciding whether to look up the same ID again. To perform another lookup, put `msg.payload.id` back into `msg.payload`. An unknown ID, an inconsistent task ID, a credential failure or a network error triggers a Catch node. Keep task IDs and private result links within your own flows.
