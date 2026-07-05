# Lovetale Operations Checklist

## Story / StoryRPG

- Story management keeps original episode text and assets as the source content.
- Story game management creates separate RPG drafts from a source story and should not overwrite source episodes or assets.
- Publish StoryRPG drafts with `public + listed` enabled before expecting them on the user StoryRPG page.
- If StoryRPG content is placed on the home page, cards must route to `/story-rpg/:id`, not the normal story reader.

## Character Chat

- Public chat characters are derived from public/listed stories and story games.
- Character ranking should prefer real dialogue, speech attribution, repeated mentions, primary flags, and registered images.
- Admin should register or generate character portraits after analysis, because image-backed cards are prioritized in the chat list.
- Reader chat messages store thread, character, avatar, and mode metadata so 1:1 and group chat histories can be restored.

## Affection / Unlock

- Affection starts at 0 and is capped at 100.
- 0-49 rises relatively quickly through reading and light chat.
- 50-87 requires context-aware chat, choices, quests, and story progress.
- 88-100 should be hard to reach and tied to special quests or premium interactions.
- Asset tiers should use these thresholds: soft 0, warm 35, spicy 65, steamy 85, premium 95.

## Deployment Checks

- Confirm Supabase env vars are set in Vercel before testing admin APIs.
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is available only server-side.
- Verify the home page, story search, character chat, StoryRPG list, and reader page after deployment.
- Local sandbox builds may stop at Nitro file tracing with `EPERM: readlink 'C:\Users\Admin'`; client and SSR bundles passing before that point means code compilation reached the expected stage locally.
