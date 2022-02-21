import parse from 'parse-link-header'
import { Octokit } from 'octokit'
// Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
if( ! process.env.GITHUB_TOKEN ){
  process.exit()
}
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

function union (setA, setB) {
  const _union = new Set(setA)
  for (const elem of setB) {
    _union.add(elem)
  }
  return _union
}

async function githubstats (org) {
  const stats = {}
  stats.stars = 0
  stats.releases = 0
  stats.issues = 0
  stats.pulls = 0
  stats.repos = []
  stats.contributors = new Set()
  const data = await octokit.rest.repos.listForOrg({
    org: org,
    type: 'public'
  })
  await Promise.all(data.data.map(async (repo) => {
    stats.stars = stats.stars + repo.stargazers_count
    const releases = parseInt(await githubreleases(org, repo.name))
    stats.releases = stats.releases + releases
    const pulls = parseInt(await githubpulls(org, repo.name))
    stats.pulls = stats.pulls + pulls
    const issues = parseInt(await githubissues(org, repo.name)) - pulls
    stats.issues = stats.issues + issues
    const contributors = await githubcontributors(org, repo.name)
    // console.log(contributors)
    stats.contributors = union(contributors, stats.contributors)

    stats.repos.push({
      name: repo.name,
      stars: repo.stargazers_count,
      releases: releases,
      issues: issues,
      pulls: pulls,
      contributors: contributors.size
    })
  }))
  return stats
}

async function githubreleases (org, repo) {
  const data = await octokit.rest.repos.listTags({
    owner: org,
    repo: repo,
    per_page: 1
  })
  // console.log(data)
  const link = parse(data.headers.link)
  // console.log(link)
  const count = link && link.last && link.last.page ? link.last.page : 0
  return count
}

async function githubissues (org, repo) {
  const data = await octokit.request({
    method: 'GET',
    url: '/repos/{org}/{repo}/issues',
    org: org,
    repo: repo,
    per_page: 1,
    state: 'all'
  })
  const link = parse(data.headers.link)
  const count = link && link.last && link.last.page ? link.last.page : 0
  return count
}

async function githubpulls (org, repo) {
  const data = await octokit.request({
    method: 'GET',
    url: '/repos/{org}/{repo}/pulls',
    org: org,
    repo: repo,
    per_page: 1,
    state: 'all',
    is: 'pr'
  })
  const link = parse(data.headers.link)
  const count = link && link.last && link.last.page ? link.last.page : 0
  return count
}

async function githubcontributors (org, repo) {
  const contributors = new Set()

  const data = await octokit.rest.repos.listContributors({
    owner: org,
    repo: repo,
    anon: true,
    per_page: 1
  })
  // console.log(data)
  const link = parse(data.headers.link)
  const count = link && link.last && link.last.page ? link.last.page : 0
  // console.log("counts = ",count)
  const loops = Math.ceil(count / 100)
  // console.log("loops = ",loops)
  for (let i = 1; i < loops + 1; i++) {
    // console.log("doing loop i ",i)
    const data = await octokit.rest.repos.listContributors({
      owner: org,
      repo: repo,
      anon: true,
      per_page: 100,
      page: i
    })
    await Promise.all(data.data.map(async (user) => {
      const id = user.login ? user.login : user.email
      contributors.add(id)
    }))
  }
  // console.log(contributors)
  // console.log(contributors.size)
  return contributors
}

async function main () {
  const stats = {}
  stats.knative = await githubstats('knative')
  stats['knative-sandbox'] = await githubstats('knative-sandbox')
  await githubcontributors('knative', 'serving')
  return stats
}

async function printReport (stats) {
  console.log('----Knative---')
  console.log(`${stats.knative.stars} \tGithub Stars`)
  console.log(`${stats.knative.pulls} \tGitub Pull Requests`)
  console.log(`${stats.knative.issues} \tGitub Pull Issues`)
  console.log(`${stats.knative.contributors.size} \tGitub Contributors`)
  console.log(`${stats.knative.releases} \t Releases`)

  console.log('----Knative-Sandbox---')
  console.log(`${stats['knative-sandbox'].stars} \tGithub Stars`)
  console.log(`${stats['knative-sandbox'].pulls} \tGitub Pull Requests`)
  console.log(`${stats['knative-sandbox'].issues} \tGitub Pull Issues`)
  console.log(`${stats['knative-sandbox'].contributors.size} \tGitub Contributors`)
  console.log(`${stats['knative-sandbox'].releases} \tReleases`)

  console.log('----Knative orgs---')
  console.log(`${stats.knative.stars + stats['knative-sandbox'].stars} \tGithub Stars`)
  console.log(`${stats.knative.pulls + stats['knative-sandbox'].pulls} \tGitub Pull Requests`)
  console.log(`${stats.knative.issues + stats['knative-sandbox'].issues} \tGitub Pull Issues`)
  console.log(`${union(stats.knative.contributors, stats['knative-sandbox'].contributors).size} \tGitub Contributors`)
  console.log(`${stats.knative.releases + stats['knative-sandbox'].releases} \tReleases`)
}

main().then(stats => {
  //console.log(JSON.stringify(stats, null, 4))
  printReport(stats)
})
