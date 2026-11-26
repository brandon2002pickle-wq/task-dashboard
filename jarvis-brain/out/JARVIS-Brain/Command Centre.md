---
type: dashboard
created: 2026-11-25
tags: [dashboard]
cssclasses: [hud]
---
# ◉ COMMAND CENTRE

> [!hud] Systems
> Live views below use Obsidian's built-in search, so no extra plugins are needed.

## Active projects
```query
path:"10-Projects" line:("status: active")
```

## Recent session logs
```query
path:"20-Sessions"
```

## Inbox
```query
path:"00-Inbox"
```

## Open questions
```query
tag:#question OR line:("- [ ] ?")
```

## Open cases
```query
path:"30-Cases" line:("status: active")
```

## Notes with no links
Claude keeps this list current with `/link`.
<!-- orphans:start -->
- (run /link)
<!-- orphans:end -->
