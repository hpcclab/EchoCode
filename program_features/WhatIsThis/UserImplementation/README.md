# UserImplementation for WhatIsThis

Set `echocode.featureImplementation.whatIsThis` to `user` to enable overrides.

Supported override files in this folder:

- `WhatIsThis` exports `registerReadCurrentLineCommand`
- `DescribeThis.js` exports `registerDescribeCurrentLineCommand`
- `CharacterReadOut.js` exports `registerCharacterReadOutCommand`

If a file is missing or exports are invalid, EchoCode falls back to built-in behavior.
