import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmod,
  symlink,
  link,
  truncate,
  stat,
  readdir,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const runsOnLinux = process.platform === 'linux'

test(
  'the restricted receiver activates and rolls back atomic releases',
  { skip: !runsOnLinux },
  async (context) => {
    const testRoot = await mkdtemp(join(tmpdir(), 'senswear-receiver-'))
    context.after(() => rm(testRoot, { recursive: true, force: true }))

    const deployRoot = join(testRoot, 'site')
    await mkdir(join(deployRoot, 'incoming'), { recursive: true })
    await mkdir(join(deployRoot, 'releases'), { recursive: true })

    const sourcePath = new URL('../deploy/receive-release.sh', import.meta.url)
    const receiverSource = await readFile(sourcePath, 'utf8')
    const configuredSource = receiverSource.replace(
      'readonly deploy_root="/var/www/senswear-web-app"',
      `readonly deploy_root="${deployRoot}"`,
    )
    assert.notEqual(configuredSource, receiverSource, 'test must override the isolated deploy root')

    const receiverPath = join(testRoot, 'receive-release.sh')
    await writeFile(receiverPath, configuredSource, 'utf8')
    await chmod(receiverPath, 0o755)

    let fixtureCount = 0
    async function makeArchive(revision, customize = async () => {}, tarOptions = []) {
      const fixture = join(testRoot, `fixture-${fixtureCount++}`)
      await mkdir(join(fixture, 'assets'), { recursive: true })
      await writeFile(join(fixture, 'index.html'), '<h1>SensWear</h1>\n')
      await writeFile(join(fixture, 'revision.txt'), `${revision}\n`)
      await writeFile(join(fixture, 'assets', 'app.js'), "console.log('SensWear');\n")

      await customize(fixture)

      const result = spawnSync(
        'tar',
        ['--create', '--gzip', '--file', '-', '--directory', fixture, ...tarOptions, '.'],
        { maxBuffer: 10 * 1024 * 1024 },
      )
      assert.equal(result.status, 0, result.stderr.toString())
      return result.stdout
    }

    function runReceiver(command, archive) {
      return spawnSync('bash', [receiverPath], {
        env: {
          ...process.env,
          SSH_ORIGINAL_COMMAND: command,
        },
        input: archive,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      })
    }

    const firstRevision = 'a'.repeat(40)
    const firstRelease = `${firstRevision}-100-1`
    const firstDeploy = runReceiver(`deploy ${firstRelease}`, await makeArchive(firstRevision))
    assert.equal(firstDeploy.status, 0, firstDeploy.stderr)
    assert.equal(await readlink(join(deployRoot, 'current')), `releases/${firstRelease}`)

    const firstRollback = runReceiver(`rollback ${firstRelease}`)
    assert.equal(firstRollback.status, 0, firstRollback.stderr)
    await assert.rejects(readlink(join(deployRoot, 'current')), (error) => error.code === 'ENOENT')

    const secondRevision = 'b'.repeat(40)
    const secondRelease = `${secondRevision}-101-1`
    const secondDeploy = runReceiver(`deploy ${secondRelease}`, await makeArchive(secondRevision))
    assert.equal(secondDeploy.status, 0, secondDeploy.stderr)
    assert.equal(await readlink(join(deployRoot, 'current')), `releases/${secondRelease}`)

    const thirdRevision = 'c'.repeat(40)
    const thirdRelease = `${thirdRevision}-102-1`
    const thirdDeploy = runReceiver(`deploy ${thirdRelease}`, await makeArchive(thirdRevision))
    assert.equal(thirdDeploy.status, 0, thirdDeploy.stderr)
    assert.equal(await readlink(join(deployRoot, 'current')), `releases/${thirdRelease}`)

    const rollback = runReceiver(`rollback ${thirdRelease}`)
    assert.equal(rollback.status, 0, rollback.stderr)
    assert.equal(await readlink(join(deployRoot, 'current')), `releases/${secondRelease}`)

    const staleRollback = runReceiver(`rollback ${thirdRelease}`)
    assert.notEqual(staleRollback.status, 0)
    assert.match(staleRollback.stderr, /not current/)
    const expectedCurrent = `releases/${secondRelease}`

    const invalidRevision = 'd'.repeat(40)
    const cases = [
      ['wrong revision', await makeArchive('e'.repeat(40))],
      [
        'parent traversal',
        await makeArchive(invalidRevision, undefined, [
          '--transform=s|^./index.html$|../escaped.html|',
        ]),
      ],
      [
        'hard link',
        await makeArchive(invalidRevision, async (fixture) => {
          await link(join(fixture, 'index.html'), join(fixture, 'copy.html'))
        }),
      ],
      [
        'oversized extracted content',
        await makeArchive(invalidRevision, async (fixture) => {
          await writeFile(join(fixture, 'large.txt'), '')
          await truncate(join(fixture, 'large.txt'), 101 * 1024 * 1024)
        }),
      ],
      [
        'symbolic link',
        await makeArchive(invalidRevision, async (fixture) => {
          await symlink('/etc/passwd', join(fixture, 'leak.txt'))
        }),
      ],
      [
        'missing assets',
        await makeArchive(invalidRevision, async (fixture) => {
          await rm(join(fixture, 'assets'), { recursive: true })
        }),
      ],
      [
        'hidden credentials',
        await makeArchive(invalidRevision, async (fixture) => {
          await writeFile(join(fixture, '.env'), 'PRIVATE=fixture-only\n')
        }),
      ],
      [
        'forged rollback marker',
        await makeArchive(invalidRevision, async (fixture) => {
          await writeFile(join(fixture, '.previous-release'), expectedCurrent)
        }),
      ],
      ['empty archive', Buffer.alloc(0)],
      ['corrupt archive', Buffer.from('invalid gzip')],
    ]
    for (const [index, [name, archive]] of cases.entries()) {
      const release = `${invalidRevision}-${200 + index}-1`
      const rejected = runReceiver(`deploy ${release}`, archive)
      assert.notEqual(rejected.status, 0, `${name} must be rejected`)
      assert.equal(await readlink(join(deployRoot, 'current')), expectedCurrent)
      await assert.rejects(
        stat(join(deployRoot, 'releases', release)),
        (error) => error.code === 'ENOENT',
      )
    }
    assert.deepEqual(await readdir(join(deployRoot, 'incoming')), [])
    await assert.rejects(
      stat(join(deployRoot, 'releases', 'escaped.html')),
      (error) => error.code === 'ENOENT',
    )

    const duplicate = runReceiver(`deploy ${secondRelease}`, await makeArchive(secondRevision))
    assert.notEqual(duplicate.status, 0)
    assert.match(duplicate.stderr, /release already exists/)

    const shellAttempt = runReceiver('bash')
    assert.notEqual(shellAttempt.status, 0)
    assert.match(shellAttempt.stderr, /invalid command/)
    const injection = runReceiver(`deploy ${firstRelease}; touch /tmp/unauthorized`)
    assert.notEqual(injection.status, 0)
    assert.match(injection.stderr, /invalid command/)
  },
)
