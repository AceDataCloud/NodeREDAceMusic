# Suno for Node-RED

![Suno](https://raw.githubusercontent.com/AceDataCloud/NodeREDAceMusic/main/suno/nodes/icons/suno.png)

Submit Suno audio jobs and retrieve finished tracks with two nodes. Install this package on its own or alongside the Ace media collection.

## Install

Use Node.js 22+ and Node-RED 4+. In **Manage palette → Install**, search for `@acedatacloud/node-red-suno`. You can also install it in your Node-RED user directory and restart the editor.

```sh
npm install @acedatacloud/node-red-suno
```

## Submit a Suno job

1. Add **Suno generate**. Create a Suno account configuration with an [Ace Data Cloud application token](https://platform.acedata.cloud/console/applications?utm_source=github&utm_medium=referral&utm_campaign=evergreen) that has Suno access.
2. Send a request as `msg.payload`, such as the JSON below. The node sends one asynchronous request per input. Generation can incur charges.
3. Save the task ID returned in `msg.payload`. Use **Suno task** with the same account to check it. If a submission times out, check your application history before retrying.

```json
{
  "action": "generate",
  "model": "chirp-v6",
  "prompt": "A calm piano instrumental for a rainy afternoon",
  "instrumental": true
}
```

The [Suno request contract](https://docs.acedata.cloud/openapi/suno.json) lists the available model, action, and input fields. Choose the options for the job you want to submit.

## Look up an existing task

Import **Examples → @acedatacloud/node-red-suno → Check an existing Suno task**. Configure your account and paste an existing task ID into the Inject node's string payload. The example performs one lookup and does not submit a generation job.

The first output carries a successful terminal task and its playable tracks. The second output carries progress, previews, or a terminal response without playable audio. Both outputs preserve other message properties and set `msg.payload` to `{ id, state, tracks }`. A track includes its ID, title, HTTPS `url`, state, and duration when available. Check `state` before scheduling another lookup. To look up the same task again, put `msg.payload.id` back into `msg.payload`.

Request errors, unknown task IDs, mismatched IDs, and failed tasks reach Node-RED's Catch node. Keep task IDs and private audio links in your own flows.
