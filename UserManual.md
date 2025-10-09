# 背景

aPaaS 平台有完整的 Open API 能力，但是目前这些能力全都以单独接口的形式提供给开发者，不方便开发者调试和调用。
在此背景下，我们在一店一群项目的基础上，封装 aPaaS 平台 RESTful API 的 Node.js SDK，简化接口调用，内置限流与 token 缓存功能。

## ✨ **功能特性**

- ✅ 获取 accessToken，自动管理 token 有效期
	
- ✅ record 单条查询、批量查询（支持分页迭代）

- ✅ record 单条创建、批量创建（支持分页迭代）

- ✅ record 单条更新、批量更新
	
- ✅ record 单条删除、批量删除
	
- ✅ 内置 Bottleneck 限流器，基于 API 接口配置限流规则
	
- ✅ 自定义日志等级
	
- ……
	





**📦 安装**

```Bash
npm install apaas-oapi-client
# or
yarn add apaas-oapi-client
```

***



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



## **🔐 认证**

### **初始化 Client**

| **参数** | **类型** | **说明** |
| :-- | :-- | :-- |
| clientId | string | 应用 clientId |
| clientSecret | string | 应用 clientSecret |
| namespace | string | 命名空间 |
| disableTokenCache | boolean | 是否禁用 token 缓存，默认 false |

***



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



# 💾 **数据模块**

## **📋 对象列表接口**

### **获取所有对象（数据表）**

```JavaScript
const res = await client.object.list({
  offset: 0,
  limit: 100,
  filter: {
    type: 'custom',
    quickQuery: 'store'
  }
});
console.log(res);
```

***

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




***

## **➕ 创建接口**

### **单条创建**

```JavaScript
const res = await client.object.create.record({
  object_name: 'object_event_log',
  record: {
    name: 'Sample text',
    content: 'Sample text'
  }
});
console.log(res);
```

### **批量创建**

> ⚠️ 每次最多创建 100 条，SDK 已自动分组限流

```JavaScript
const { total, items } = await client.object.create.recordsWithIterator({
  object_name: 'object_event_log',
  records: [
    { name: 'Sample text 1', content: 'Sample text 1' },
    { name: 'Sample text 2', content: 'Sample text 2' }
  ]
});
console.log('Total:', total);
console.log('Items:', items);
```



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



## **📊 对象元数据接口**

### **获取指定对象字段元数据**

```JavaScript
const res = await client.object.metadata.field({
  object_name: '_user',
  field_name: '_id'
});
console.log(res);
```

### **获取指定对象所有字段信息**

```JavaScript
const res = await client.object.metadata.fields({
  object_name: 'object_store'
});
console.log(res);
```

***



# **📎 附件模块**

## **文件操作**

### **上传文件**

```JavaScript
const fs = require('fs');

const res = await client.attachment.file.upload({
  file: fs.createReadStream('/path/to/file.zip')
});
console.log(res);
// 返回: { code: "0", msg: "success", data: { fileId, type, name, size } }
```

### **下载文件**

```JavaScript
const fileData = await client.attachment.file.download({
  file_id: '625d2f602af94d46972073db32a99ed2'
});
// 返回文件二进制流
```

### **删除文件**

```JavaScript
const res = await client.attachment.file.delete({
  file_id: '625d2f602af94d46972073db32a99ed2'
});
console.log(res);
```

## **头像图片操作**

### **上传头像图片**

```JavaScript
const fs = require('fs');

const res = await client.attachment.avatar.upload({
  image: fs.createReadStream('/path/to/avatar.jpg')
});
console.log(res);
```

### **下载头像图片**

```JavaScript
const imageData = await client.attachment.avatar.download({
  image_id: 'c70d03b21d3c40468ee710d984cfb7a8_o'
});
// 返回图片二进制流
```

***



# **💽 全局数据模块**

## **全局选项**

### **查询全局选项详情**

```JavaScript
const res = await client.global.options.detail({
  api_name: 'global_option_abc'
});
console.log(res);
```

### **查询全局选项列表**

```JavaScript
const res = await client.global.options.list({
  limit: 10,
  offset: 0,
  filter: { quickQuery: 'Sample Text' }
});
console.log(res);
```

### **分页查询所有全局选项**

```JavaScript
const { total, items } = await client.global.options.listWithIterator({
  limit: 100,
  filter: { quickQuery: 'Sample Text' }
});
console.log('Total:', total);
console.log('Items:', items);
```

## **环境变量**

### **查询环境变量详情**

```JavaScript
const res = await client.global.variables.detail({
  api_name: 'global_variable_abc'
});
console.log(res);
```

### **查询环境变量列表**

```JavaScript
const res = await client.global.variables.list({
  limit: 10,
  offset: 0,
  filter: { quickQuery: 'Sample Text' }
});
console.log(res);
```

### **分页查询所有环境变量**

```JavaScript
const { total, items } = await client.global.variables.listWithIterator({
  limit: 100,
  filter: { quickQuery: 'Sample Text' }
});
console.log('Total:', total);
console.log('Items:', items);
```

***



# **📄 页面模块**

### **获取所有页面**

```JavaScript
const res = await client.page.list({
  limit: 10,
  offset: 0
});
console.log(res);
```

### **分页查询所有页面**

```JavaScript
const { total, items } = await client.page.listWithIterator({
  limit: 100
});
console.log('Total:', total);
console.log('Items:', items);
```

### **获取页面详情**

```JavaScript
const res = await client.page.detail({
  page_id: 'appPage_page'
});
console.log(res);
```

### **获取页面访问地址**

```JavaScript
const res = await client.page.url({
  page_id: 'appPage_page',
  pageParams: { var_page: '1234567890' },
  parentPageParams: {
    navId: 'page_nav_id',
    pageApiName: 'page_name'
  },
  navId: 'page_nav_id',
  tabId: 'tab_id'
});
console.log(res);
// 返回: { code: "0", msg: "success", data: { link: "https://..." } }
```

***



# **🏢 部门模块**

## **部门 ID 交换**

### **单个部门 ID 交换**

```JavaScript
const res = await client.department.exchange({
  department_id_type: 'external_department_id',
  department_id: 'Y806608904'
});
console.log(res);
```

### **批量部门 ID 交换**

每次最多 100 个，SDK 已自动拆分限流。

```JavaScript
const res = await client.department.batchExchange({
  department_id_type: 'external_department_id',
  department_ids: ['id1', 'id2', 'id3']
});
console.log(res);
```

***

<br>

# **🔄 自动化流程模块**

## **V1 版本 - 执行流程**

```JavaScript
const res = await client.automation.v1.execute({
  flow_api_name: 'automation_cd05fdab67d',
  operator: {
    _id: 100,
    email: 'sample@feishu.cn'
  },
  params: {
    varRecord_ab67d031d44: {
      _id: 100
    }
  }
});
console.log(res);
// 返回: { code: "0", msg: "success", data: { errMsg, executionId, status, data, errCode } }
```

## **V2 版本 - 执行流程**

V2 版本支持流程重新提交功能。

```JavaScript
const res = await client.automation.v2.execute({
  flow_api_name: 'automation_a9ec6ee5fb1',
  operator: {
    _id: 100,
    email: 'sample@feishu.cn'
  },
  params: {
    storeId: 100
  },
  is_resubmit: true,
  pre_instance_id: '1835957428957195'
});
console.log(res);
// 返回: { code: "0", msg: "success", data: { errMsg, executionId, status, data, errCode } }
```

***

<br>

# **☁️ 云函数模块**

```JavaScript
const res = await client.function.invoke({
  name: 'StoreMemberUpdate',
  params: { key: 'value' }
});
console.log(res);
```

***

<br>

## **🛠️ 高级**

### **获取当前 token**

```JavaScript
console.log(client.token);
```

### **获取 token 过期时间**

```JavaScript
console.log(client.tokenExpireTime); // 返回剩余秒数
```

### **获取当前 namespace**

```JavaScript
console.log(client.currentNamespace);
```

***



## **💡 备注**

- 本 SDK 默认使用 [axios](https://www.npmjs.com/package/axios) 请求。

- 内置 [bottleneck](https://www.npmjs.com/package/bottleneck) 进行请求限流。

- 日志打印默认使用 console.log 并带时间戳，可通过 setLoggerLevel 动态控制输出等级。


***



> 由 [aPaaS OAPI Client SDK](https://www.npmjs.com/package/apaas-oapi-client) 提供支持，如有问题请提交 Issue 反馈。

---