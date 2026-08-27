.PHONY: patch minor major

# Cut a release. Tags the repo, which builds, signs, notarizes and publishes
# with the updater metadata.
#   make patch   x.y.z -> x.y.(z+1)
#   make minor   x.y.z -> x.(y+1).0
#   make major   x.y.z -> (x+1).0.0
patch minor major:
	@bash scripts/release.sh $@
