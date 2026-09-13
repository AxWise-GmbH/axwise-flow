def target:
  if (.revisionName | type) == "string" and (.revisionName | length) > 0 then
    .revisionName
  else
    error("effective traffic target must name an exact revision")
  end;

# Symbolic LATEST in the desired spec may resolve to the failed candidate by
# rollback time. Recovery therefore pins the exact revisions that were
# effectively serving before this invocation.
(.status.traffic // []) as $traffic
| {
    allocations: (
      [
        $traffic[]?
        | select((.percent // 0) > 0)
        | { target: target, percent: .percent }
      ]
      | sort_by(.target)
      | group_by(.target)
      | map({ target: .[0].target, percent: (map(.percent) | add) })
    ),
    tags: (
      [
        $traffic[]?
        | select((.tag // "") != "")
        | { tag: .tag, target: target }
      ]
      | sort_by(.tag)
    )
  }
| if (.allocations | length) == 0 then
    error("traffic has no positive allocation")
  elif ([.allocations[].percent] | add) != 100 then
    error("traffic allocation must total 100 percent")
  elif any(.allocations[]; (.percent | type) != "number"
      or .percent != (.percent | floor)
      or .percent < 1
      or .percent > 100) then
    error("traffic percentages must be whole numbers in 1..100")
  elif (.tags | map(.tag) | unique | length) != (.tags | length) then
    error("traffic tags must be unique")
  else
    .
  end
