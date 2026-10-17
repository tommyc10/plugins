The Change windows page now has a "Running late" view that shows every late window from every group in one place. I committed it as `a0a4901` on a new branch, `change-windows-running-late`, in imperial-ops-b; nothing is pushed.

**How to get there**
- **From the list:** a "Running late" row sits just under "Every window". It shows how many windows are past their planned end and how many groups they're in, with the number in rose.
- **From the keyboard:** press `L`. Press it again to go back to the group and tab you were on.
- **From the ⌘K menu:** "Windows running late".

**What it shows**
- Every window past its planned end, whatever its group, with the one that's over by the most first.
- The heading reads "Running late", followed by a sentence like: "18 windows are past their planned end, in 11 CI families. The furthest over is CHG-3009, by 15h 47m."
- When you're viewing all groups at once, each window's second line shows its group instead of its times, so you know who to chase. Picking a window opens it in the side panel as before.

**Things that changed along the way**
- The page now keeps track of which tab (In place, Late, and so on) is showing, so the list row and `L` can switch to the Late tab. Clicking "Every window" goes back to the In place tab.
- The "N late" note on the "Every window" row is gone, because the Running late row just below it says the same thing.
- The keys at the foot of the list now include `L Late`. To make room I took out `/ Search`, because the `/` key is already shown on the search box.
- The page's guided tour now mentions Running late and `L`.

I checked it in the browser with both sample datasets, in light and dark, with the tab toggles, the side panel and the ⌘K entry, and at a narrow 520px pane. The type check and build both pass, and the change adds no raw colours.

If you've searched for something, Running late only covers the windows that match the search.
