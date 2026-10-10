import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../checks.ts';

// The anti-slop checks for the non-TypeScript stacks. Each case is a line the
// check must flag and a near-miss it must not — the near-misses are the point:
// a deterministic finding is a fact, and a false one is the worst outcome.

interface Case {
  id: string;
  file: string;
  flags: string[];
  passes: string[];
  // A file the check must ignore even when the line matches.
  ignoredIn?: string;
}

const CASES: Case[] = [
  // --- python
  {
    id: 'python/blanket-suppression',
    file: 'app/a.py',
    flags: ['import foo  # type: ignore', 'x = f()  #type:ignore', 'import os  # noqa', 'y = g()  # pyright: ignore'],
    passes: ['import foo  # type: ignore[import-untyped]', 'import os  # noqa: F401', 'msg = "type ignore"'],
  },
  {
    id: 'python/broad-exception-assertion',
    file: 'tests/test_a.py',
    flags: ['with pytest.raises(Exception):', 'self.assertRaises(Exception, parse, "x")', 'with pytest.raises(BaseException):'],
    passes: ['with pytest.raises(ValueError):', 'with pytest.raises(Exception, match=r"timeout"):', 'self.assertRaises(ExceptionalCase, f)'],
  },
  {
    id: 'python/module-patching',
    file: 'tests/test_a.py',
    flags: ['@patch("app.billing.client.requests.post")', 'mocker.patch("app.billing.charge", return_value=None)', 'monkeypatch.setattr("app.config.DEBUG", True)'],
    passes: ['mocker.patch.object(gateway, "charge")', 'resp = client.patch("/users/1", json=body)', 'with patch.dict(os.environ, {"X": "1"}):'],
  },
  {
    id: 'python/quadratic-accumulation',
    file: 'app/a.py',
    flags: ['flat = sum(lists, [])', 'rows = sum((r.items for r in reports), [])', 'acc = sum(parts, start=[])'],
    passes: ['total = sum(values, 0)', 'n = sum([1, 2, 3])', 'checksum(a, [])'],
  },
  // --- java
  {
    id: 'java/reference-equality',
    file: 'src/A.java',
    flags: ['if (status == "ACTIVE") {', 'return "admin" != user.getRole();'],
    passes: ['if ("ACTIVE".equals(status)) {', 'log.info("a == " + b);', 'if (count == 0) return "none";', "if (c == '\"') quote();"],
  },
  {
    id: 'java/bigdecimal-value-semantics',
    file: 'src/A.java',
    flags: ['BigDecimal fee = new BigDecimal(0.1);', 'var r = new BigDecimal(1e-3);', 'new BigDecimal(2.5d, MathContext.DECIMAL64)'],
    passes: ['new BigDecimal("0.1")', 'new BigDecimal(12)', 'BigDecimal.valueOf(0.1)', 'new BigDecimal(100L)'],
  },
  {
    id: 'java/dropped-exception-cause',
    file: 'src/A.java',
    flags: ['throw new ServiceException(e.getMessage());', 'throw new IllegalStateException("load failed: " + ex.getMessage());'],
    passes: ['throw new ServiceException(e.getMessage(), e);', 'throw new IllegalStateException(e);', 'log.warn(e.getMessage());'],
  },
  {
    id: 'java/print-stack-trace',
    file: 'src/A.java',
    flags: ['e.printStackTrace();', '} catch (IOException e) { e.printStackTrace(); }'],
    passes: ['log.error("failed", e);', 'e.printStackTrace(System.err);', 'void printStackTraces() {}'],
  },
  {
    id: 'java/ignored-pure-result',
    file: 'src/A.java',
    flags: ['name.trim();', '    email.toLowerCase();', 'user.getName().toUpperCase(Locale.ROOT);'],
    passes: ['name = name.trim();', 'return email.toLowerCase();', '    .trim();', 'list.add(x.trim());'],
  },
  // --- kotlin
  {
    id: 'kotlin/todo-stub',
    file: 'app/src/main/kotlin/Gateway.kt',
    flags: ['override fun refund(id: String): Receipt = TODO("Not yet implemented")', '    TODO()'],
    passes: ['val label = "TODO list"', 'fun addTodo(item: Todo) = todos.add(item)', 'repo.TODO()'],
    ignoredIn: 'app/src/test/kotlin/FakeGatewayTest.kt',
  },
  {
    id: 'kotlin/dropped-exception-cause',
    file: 'src/A.kt',
    flags: ['throw ServiceException(e.message)', '  throw AppException(e.message ?: "unknown")'],
    passes: ['throw ServiceException(e.message, e)', 'throw IllegalStateException(e)', 'logger.warn(e.message)'],
  },
  {
    id: 'kotlin/downcast-readonly-collection',
    file: 'src/A.kt',
    flags: ['(items as MutableList<Item>).add(item)', '(tags as? MutableSet<String>)?.clear()'],
    passes: ['val items: MutableList<Item> = mutableListOf()', 'items.toMutableList().add(item)', 'val l = list as List<Item>'],
  },
  {
    id: 'kotlin/print-stack-trace',
    file: 'src/A.kt',
    flags: ['e.printStackTrace()'],
    passes: ['logger.error("sync failed", e)', 'e.printStackTrace(System.err)'],
  },
  // --- swift
  {
    id: 'swift/concurrency-checking-opt-out',
    file: 'App/Cache.swift',
    flags: ['final class Cache: @unchecked Sendable {', 'nonisolated(unsafe) static var shared = Store()', '@preconcurrency import LegacySDK'],
    passes: ['final class Cache: Sendable {', 'nonisolated func load() async {', 'final class Cache: @unchecked Sendable { // guarded by lock, IOS-1234'],
  },
  {
    id: 'swift/unowned-capture',
    file: 'App/A.swift',
    flags: ['api.fetch { [unowned self] result in', '.sink { [weak store, unowned self] value in'],
    passes: ['api.fetch { [weak self] result in', 'unowned let parent: Node', 'lazy var header: HeaderView = { [unowned self] in HeaderView(owner: self) }()'],
  },
  {
    id: 'swift/implicitly-unwrapped-declaration',
    file: 'App/ProfileViewController.swift',
    flags: ['var viewModel: ProfileViewModel!', 'private var session: URLSession!'],
    passes: ['@IBOutlet weak var titleLabel: UILabel!', 'var name: String?', 'let s: String = name!', 'let ok = value != nil'],
    ignoredIn: 'AppTests/ProfileViewControllerTests.swift',
  },
  {
    id: 'swift/copying-reduce-accumulator',
    file: 'App/A.swift',
    flags: ['let all = pages.reduce([]) { $0 + $1.items }', 'let hex = bytes.reduce("") { $0 + String(format: "%02x", $1) }', 'let byId = users.reduce([String: User]()) { acc, u in'],
    passes: ['pages.reduce(into: []) { $0 += $1.items }', 'prices.reduce(0, +)', 'xs.reduce(Builder()) { $0.add($1) }'],
  },
  // --- csharp
  {
    id: 'csharp/rethrow-loses-stack',
    file: 'src/A.cs',
    flags: ['throw ex;', '            throw ex;', 'catch (Exception ex) { Log(ex); throw ex; }'],
    passes: ['throw;', 'throw new InvalidOperationException("Sync failed.", ex);', 'throw exceptionFactory.Create();'],
  },
  {
    id: 'csharp/reserved-exception-type',
    file: 'src/Services/CustomerService.cs',
    flags: ['throw new Exception("Customer not found");', 'throw new System.NullReferenceException(nameof(order));'],
    passes: ['throw new InvalidOperationException("Order already shipped.");', 'throw new ExceptionHandlerMissingException();', 'mock.Setup(x => x.Get()).Throws(new Exception());'],
    ignoredIn: 'tests/Shop.Tests/FakeRepo.cs',
  },
  {
    id: 'csharp/culture-implicit-parse-format',
    file: 'src/A.cs',
    flags: ['var price = decimal.Parse(row["price"]);', 'var at = DateTime.Parse(dto.CreatedAt);'],
    passes: ['decimal.Parse(s, CultureInfo.InvariantCulture)', 'double.TryParse(s, out var d)', 'int.Parse(s)'],
  },
  {
    id: 'csharp/ef-inmemory-test-double',
    file: 'tests/A.cs',
    flags: ['.UseInMemoryDatabase("orders-test")', 'services.AddDbContext<AppDb>(o => o.UseInMemoryDatabase(nameof(AppDb)));'],
    passes: ['.UseSqlite("Data Source=:memory:")', 'services.AddDistributedMemoryCache();'],
  },
  // --- go
  {
    id: 'go/error-wrap-verb',
    file: 'internal/a.go',
    flags: ['return fmt.Errorf("load config: %v", err)', 'return nil, fmt.Errorf("user %d: %s", id, err)'],
    passes: ['return fmt.Errorf("load config: %w", err)', 'return fmt.Errorf("bad id %v", id)', 'return fmt.Errorf("upstream: %v", err) // opaque: do not leak driver errors'],
  },
  {
    id: 'go/missing-client-server-timeout',
    file: 'cmd/api/main.go',
    flags: ['log.Fatal(http.ListenAndServe(":8080", mux))', 'http.ListenAndServeTLS(addr, c, k, h)'],
    passes: ['srv.ListenAndServe()', 'myhttp.ListenAndServe(":80", nil)'],
    ignoredIn: 'internal/server_test.go',
  },
  // --- terraform
  {
    id: 'terraform/empty-list-equality',
    file: 'main.tf',
    flags: ['count = var.my_list == [] ? 0 : 1', 'count = [] == var.ids ? 0 : 1'],
    passes: ['count = length(var.my_list) == 0 ? 0 : 1', 'default = []', 'tags = var.x == null ? [] : var.x'],
  },
  {
    id: 'terraform/ignore-changes-all',
    file: 'main.tf',
    flags: ['ignore_changes = all', '    ignore_changes  = all'],
    passes: ['ignore_changes = [tags]', 'ignore_changes = [all_tags]'],
  },
  // --- react
  {
    id: 'react/set-state-in-render',
    file: 'src/Toggle.tsx',
    flags: ['<button onClick={setOpen(true)}>', '  onChange={setValue(e.target.value)}'],
    passes: ['<button onClick={() => setOpen(true)}>', '<input onChange={setValue} />', '<li onClick={settings.open(id)}>'],
  },
  {
    id: 'react/javascript-url',
    file: 'src/Menu.tsx',
    flags: ['<a href="javascript:void(0)">', '<Link to="javascript:void(0)">'],
    passes: ['<a href="/javascript-guide">', 'const lang = "javascript:"', '<button type="button" onClick={go}>'],
  },
  {
    id: 'react/async-effect-callback',
    file: 'src/Search.tsx',
    flags: ['useEffect(async () => {', 'React.useEffect(async function load() {'],
    passes: ['useEffect(() => { async function load() {} load() }, [])', 'useAsyncEffect(async () => {'],
  },
  {
    id: 'react/impure-render',
    file: 'src/List.tsx',
    flags: ['<Row key={Math.random()} />', '{items.map(i => <li key={nanoid()}>{i}</li>)}'],
    passes: ['<Row key={row.id} />', 'const [id] = useState(() => crypto.randomUUID())', '<X key={uuidFor(item)} />'],
  },
  {
    id: 'react-native/deep-import',
    file: 'src/a.tsx',
    flags: ["import NativeAnimatedHelper from 'react-native/Libraries/Animated/NativeAnimatedHelper';", "import 'react-native/Libraries/Core/InitializeCore';"],
    passes: ["import { View } from 'react-native';", "jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');", "import 'react-native/setup-env';"],
  },
  {
    id: 'react-native/cached-window-dimensions',
    file: 'src/styles.ts',
    flags: ["const { width } = Dimensions.get('window');", "export const SCREEN_W = Dimensions.get('screen').width;"],
    passes: ['  const { width } = useWindowDimensions();', "  const w = Dimensions.get('window').width;", "Dimensions.addEventListener('change', onChange);"],
  },
  // --- vue / angular / svelte / dom
  {
    id: 'vue/async-computed',
    file: 'src/User.vue',
    flags: ['const user = computed(async () => await api.get(id.value))'],
    passes: ['const user = computedAsync(async () => fetch(url))', 'const c = computed(() => isAsync.value)'],
  },
  {
    id: 'vue/shared-mutable-default',
    file: 'src/TagList.vue',
    flags: ['      default: [],', "    default: { size: 'md' },"],
    passes: ['      default: () => [],', "    default: 'primary',", 'export default {'],
  },
  {
    id: 'angular/async-lifecycle-hook',
    file: 'src/app/user.component.ts',
    flags: ['  async ngOnInit() {', '  public async ngAfterViewInit(): Promise<void> {'],
    passes: ['  ngOnInit() { void this.load(); }', '  async ngOnInitData() {'],
  },
  {
    id: 'angular/output-native-event-name',
    file: 'src/app/qty.component.ts',
    flags: ['  @Output() change = new EventEmitter<Item>();', '  select = output<Item>();', "  @Output('submit') submitted = new EventEmitter();"],
    passes: ['  @Output() selectionChange = new EventEmitter<Item>();', '  @Output() close = new EventEmitter<void>();', '  @Input() change = 0;'],
  },
  {
    id: 'angular/banana-out-of-box',
    file: 'src/app/search.component.html',
    flags: ['<input ([ngModel])="name">'],
    passes: ['<input [(ngModel)]="name">', '<button (click)="save([item])">Save</button>'],
  },
  {
    id: 'angular/manual-lifecycle-call',
    file: 'src/app/list.component.ts',
    flags: ['    this.ngOnInit();', '  refresh() { this.ngOnDestroy(); this.ngOnInit(); }'],
    passes: ['    super.ngOnInit();', '    this.ngOnInitDone = true;'],
    ignoredIn: 'src/app/list.component.spec.ts',
  },
  {
    id: 'angular/impure-pipe',
    file: 'src/app/filter.pipe.ts',
    flags: ["@Pipe({ name: 'fromNow', pure: false })"],
    passes: ['  pure: true,', "@Pipe({ name: 'fromNow' })"],
  },
  {
    id: 'svelte/async-store-start',
    file: 'src/lib/stores/user.js',
    flags: ['export const user = readable(null, async (set) => {'],
    passes: ['export const user = readable(null, (set) => { load().then(set); });', 'const a = writable(await getInitial());'],
  },
  {
    id: 'svelte/load-in-page-component',
    file: 'src/routes/orders/+page.svelte',
    flags: ['  export async function load({ fetch }) {', '  export const load = async () => {'],
    passes: ['  export let data;', "  import { load } from './+page';"],
  },
  {
    id: 'svelte/double-brace-mustache',
    file: 'src/routes/+page.svelte',
    flags: ['<h1>Hello {{ name }}</h1>', '<p>{{user.email}}</p>'],
    passes: ['<h1>Hello {name}</h1>', '<Chart options={{ responsive }} />', "  {$t('greeting', { default: 'Hi {{name}}' })}"],
  },
  {
    id: 'dom/remove-listener-fresh-function',
    file: 'src/widget.js',
    flags: ["window.removeEventListener('resize', this.onResize.bind(this));", "el.removeEventListener('click', () => this.toggle());"],
    passes: ["window.removeEventListener('resize', this.onResize);", "window.removeEventListener('click', getListener());"],
  },
  {
    id: 'dom/on-property-clobbers-handler',
    file: 'src/embed.js',
    flags: ['window.onload = init;', 'document.onkeydown = (e) => handleKey(e);'],
    passes: ["window.addEventListener('load', init);", 'if (window.onload === null) {}', 'myWindow.onload = init;'],
  },
];

const found = (id: string, file: string, text: string) =>
  runChecks({ added: [{ file, line: 1, text }], files: [file], body: '' }, [id]).findings.map((f) => f.ruleId);

for (const c of CASES) {
  test(`${c.id} flags what it should and nothing it should not`, () => {
    for (const text of c.flags) assert.deepEqual(found(c.id, c.file, text), [c.id], `should flag: ${text}`);
    for (const text of c.passes) assert.deepEqual(found(c.id, c.file, text), [], `should pass: ${text}`);
    if (c.ignoredIn) {
      assert.deepEqual(found(c.id, c.ignoredIn, c.flags[0] ?? ''), [], `should ignore ${c.ignoredIn}`);
    }
  });
}

// Every check is limited by file type: the same text in another language's
// file, in prose or in a comment is not a finding.
test('stack checks stay inside their own file types', () => {
  for (const c of CASES) {
    const line = c.flags[0] ?? '';
    assert.deepEqual(found(c.id, 'docs/notes.md', line), [], `${c.id} fired on Markdown`);
  }
});

test('every stack check is covered by a case here', async () => {
  const { CHECKS } = await import('../checks.ts');
  const covered = new Set(CASES.map((c) => c.id));
  const stackIds = Object.keys(CHECKS).filter(
    (id) => !id.startsWith('core/') && !id.startsWith('javascript/') && !id.startsWith('typescript/')
  );
  assert.deepEqual(stackIds.filter((id) => !covered.has(id)), []);
});
