# 背景

aPaaS 平台有完整的 Open API 能力，但是目前这些能力全都以单独接口的形式提供给开发者，不方便开发者调试和调用。
在此背景下，我们在一店一群项目的基础上，封装 aPaaS 平台 RESTful API 的 Node.js SDK，简化接口调用，内置限流与 token 缓存功能。

## ✨ **功能特性**

- ✅ 获取 accessToken，自动管理 token 有效期
	
- ✅ record 单条查询、 records 记录列表查询（支持分页迭代）
	
- ✅ record 单条更新、批量更新
	
- ✅ record 单条删除、批量删除
	
- ✅ 内置 Bottleneck 限流器，基于 API 接口配置限流规则
	
- ✅ 自定义日志等级
	
- ……
	

<br>

<br>

**📦 安装**

```Bash
npm install apaas-oapi-client
# or
yarn add apaas-oapi-client
```

***

<br>

# **🚀 快速开始**

```JavaScript
const { apaas } = require('apaas-oapi-client');

async function main() {
  const client = new apaas.Client({
    clientId: 'your_client_id',
    clientSecret: 'your_client_secret',
    namespace: 'app_xxx'
  });

  await client.init();
  client.setLoggerLevel(3); // 设置日志等级 (0-5)

  console.log('Access Token:', client.token);
  console.log('Namespace:', client.currentNamespace);
}

main();
```

***

<br>

## **🔐 认证**

### **初始化 Client**

| **参数** | **类型** | **说明** |
| :-- | :-- | :-- |
| clientId | string | 应用 clientId |
| clientSecret | string | 应用 clientSecret |
| namespace | string | 命名空间 |
| disableTokenCache | boolean | 是否禁用 token 缓存，默认 false |

***

<br>

## **📝 日志等级**

可调用 setLoggerLevel(level) 设置日志等级。

| **Level** | **名称** | **说明** |
| :-- | :-- | :-- |
| 0 | fatal | 严重错误 |
| 1 | error | 错误 |
| 2 | warn | 警告 |
| 3 | info | 信息（默认） |
| 4 | debug | 调试信息 |
| 5 | trace | 追踪 |

***

<br>

## **🔍 查询接口**

查询条件请根据实际需求自行拼装。详情参考 API 接口文档示例。

### **单条查询**

```JavaScript
const res = await client.object.search.record({
  object_name: 'object_store',
  record_id: 'your_record_id',
  select: ['field1', 'field2']
});
console.log(res);
```

***

### **批量查询**

每次查询最多返回 100 条记录。

```JavaScript
const res = await client.object.search.records({
  object_name: 'object_store',
  data: {
    need_total_count: true,
    page_size: 100,
    offset: 0
  }
});
console.log(res);
```

***

### **分页查询所有记录**

在上一个请求的基础上，封装每次查询最多返回 100 条记录。

```JavaScript
const { total, items } = await client.object.search.recordsWithIterator({
  object_name: 'object_store',
  data: {
    need_total_count: true,
    page_size: 100,
    offset: 0
  }
});

console.log('Total:', total);
console.log('Items:', items);
```

***

<br>

## **✏️ 更新接口**

### **单条更新**

```JavaScript
const res = await client.object.update.record({
  object_name: 'object_store',
  record_id: 'your_record_id',
  record: { field1: 'newValue' }
});
console.log(res);
```

***

### **批量更新**

> ⚠️ 每次最多更新 100 条，SDK 已自动分组限流

```JavaScript
const res = await client.object.update.recordsBatchUpdate({
  object_name: 'object_store',
  records: [
    { _id: 'id1', field1: 'value1' },
    { _id: 'id2', field1: 'value2' }
  ]
});
console.log(res);
```

***

<br>

## **🗑️ 删除接口**

### **单条删除**

```JavaScript
const res = await client.object.delete.record({
  object_name: 'object_store',
  record_id: 'your_record_id'
});
console.log(res);
```

***

### **批量删除**

> ⚠️ 每次最多删除 100 条，SDK 已自动分组限流

```JavaScript
const res = await client.object.delete.recordsBatchDelete({
  object_name: 'object_store',
  ids: ['id1', 'id2', 'id3']
});
console.log(res);
```

***

## **🛠️ 高级**

### **获取当前** **token**

```JavaScript
console.log(client.token);
```

### **获取当前 namespace**

```JavaScript
console.log(client.currentNamespace);
```

***

<br>

## **💡 备注**

- 本 SDK 默认使用 [axios](https://www.npmjs.com/package/axios) 请求。
	
- 内置 [bottleneck](https://www.npmjs.com/package/bottleneck) 进行请求限流。
	
- 日志打印默认使用 console.log 并带时间戳，可通过 setLoggerLevel 动态控制输出等级。
	

***

<br>

<br>

> 由 [aPaaS OAPI Client SDK](https://www.npmjs.com/package/apaas-oapi-client) 提供支持，如有问题请提交 Issue 反馈。

<br>