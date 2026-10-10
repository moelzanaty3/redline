// DO NOT MERGE — Redline validation seed (anti-slop rules).
using System;
using System.Globalization;

public class AntiSlop
{
    public Task<List<Order>> GetOpenAsync(CancellationToken ct)
    {
        using var db = _factory.CreateDbContext();
        // SEED 1 [BLOCKER] (csharp/task-returned-from-using) context disposed before the query runs
        return db.Orders.Where(o => o.IsOpen).ToListAsync(ct);
    }

    public string CreateResetCode()
    {
        // SEED 2 [BLOCKER] (csharp/insecure-random) predictable reset code
        var code = new Random().Next(100000, 999999);
        return code.ToString(CultureInfo.InvariantCulture);
    }

    public async Task SaveAsync(Order order, CancellationToken ct)
    {
        try { await _repo.SaveAsync(order, ct); }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "Save failed");
            // SEED 3 [HIGH] (csharp/rethrow-loses-stack) stack trace restarts here
            throw ex;
        }
    }

    public async Task<Customer> GetAsync(Guid id, CancellationToken ct)
    {
        return await _db.Customers.FindAsync([id], ct)
            // SEED 4 [HIGH] (csharp/reserved-exception-type) generic Exception forces catch (Exception)
            ?? throw new Exception("Customer not found");
    }

    public decimal Amount(string[] cols)
    {
        // SEED 5 [HIGH] (csharp/culture-implicit-parse-format) parsed with the server culture
        return decimal.Parse(cols[2]);
    }

    // SEED 6 [HIGH] (csharp/case-compare-via-tolower) culture-dependent comparison
    public bool IsAdmin(string role) => role.ToUpper() == "ADMIN";

    public ShopDb TestDb() =>
        new ShopDb(new DbContextOptionsBuilder<ShopDb>()
            // SEED 7 [HIGH] (csharp/ef-inmemory-test-double) in-memory provider hides real query failures
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
}
