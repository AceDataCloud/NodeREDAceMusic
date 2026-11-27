# ACE Music task for Node-RED

<img src="https://cdn.acedata.cloud/acemusic-icon-52deddfc87b9.png" alt="" width="64" height="64">

Use this node to check an ACE Music task created by your application and route the result to the next step in a flow. One input performs one read-only lookup. If the task returned one usable track and the other failed, the first output still delivers that track.

For audio, image and video generation and task lookup across ten services, install [Ace Data Cloud media for Node-RED](https://github.com/AceDataCloud/NodeREDAceMusic/tree/main/media). Both packages can be installed together.

## Install

In **Manage palette → Install**, search for `@acedatacloud/node-red-acemusic`. For manual installation, run the following command in your Node-RED user directory and restart Node-RED:

```sh
npm install @acedatacloud/node-red-acemusic
```

Use Node.js 22 or later with Node-RED 4 or 5. The node appears in the **network** category.

## Configure and run

1. Open [Ace Data Cloud Applications](https://platform.acedata.cloud/console/applications?utm_source=opensource&utm_medium=referral&utm_campaign=evergreen) and create an application key with ACE Music task lookup access. Configure the key in the node's password field without the `Bearer` prefix. Node-RED stores it as a credential and excludes it from flow exports.
2. Open **Import → Examples → @acedatacloud/node-red-acemusic** and import **Check a music task**, or add the node to your own flow.
3. Put your original task ID in the Inject node's string payload. Deploy the flow and click Inject.
4. The first output carries playable tracks. The second carries tasks with no playable audio, including tasks still processing and terminal failures. Connect a Catch node to handle HTTP or transport errors and unknown task IDs.

Both outputs preserve other message properties and replace `msg.payload` with an object containing the task ID, state, and tracks. Use `msg.payload.tracks[0].url` for the first available track. Keep task IDs and private audio links within your own flows. This node calls only the [ACE Music task lookup API](https://docs.acedata.cloud/openapi/acemusic.json).

## Development

Run `npm ci` and `npm test`. The tests use Node-RED's official runtime test helper and controlled task responses.
